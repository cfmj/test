/**
 * incognito.js
 * 无痕/隐私模式检测模块
 *
 * 支持浏览器：
 * - Chrome / Chromium（存储配额限制检测）
 * - Firefox（IndexedDB 限制检测）
 * - Safari（FileSystem API 检测）
 * - Edge / 其他 Chromium 内核浏览器
 */

'use strict';

const IncognitoDetector = (() => {
  /**
   * 识别当前浏览器品牌
   */
  function getBrowserType() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'edge';
    if (/Chrome\//.test(ua) && /Safari\//.test(ua)) return 'chrome';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'safari';
    return 'unknown';
  }

  /**
   * 从 User-Agent 中提取 Chrome 主版本号
   * @returns {number} Chrome 主版本号；非 Chrome 浏览器返回 0
   */
  function getChromeVersion() {
    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Chrome / Edge 无痕模式检测
   *
   * Chrome < 120：无痕模式下 navigator.storage.estimate() 的 quota
   *   被固定限制在约 120 MB 以内，正常模式下为数 GB。
   *
   * Chrome >= 120（含 145+）：quota 限制改为基于设备 RAM（约为 RAM 的 10%），
   *   120 MB 阈值已失效，改用 detectChromiumModern() 处理。
   *
   * 参考：https://developer.chrome.com/docs/privacy-security/storage-quota
   */
  async function detectChromium() {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return { result: false, method: 'storage-quota', reason: 'API unavailable' };
    }
    try {
      const { quota } = await navigator.storage.estimate();
      const chromeVersion = getChromeVersion();

      if (chromeVersion >= 120) {
        // Chrome 120+ 修改了无痕模式存储配额计算逻辑，使用新方法检测
        return await detectChromiumModern(quota);
      }

      // Chrome < 120：120 MB 阈值（字节）
      const INCOGNITO_QUOTA_THRESHOLD = 120 * 1024 * 1024;
      return {
        result: quota < INCOGNITO_QUOTA_THRESHOLD,
        method: 'storage-quota',
        quota,
        threshold: INCOGNITO_QUOTA_THRESHOLD,
      };
    } catch (err) {
      return { result: false, method: 'storage-quota', reason: err.message };
    }
  }

  /**
   * Chrome 120+ 无痕模式检测（包含 Chrome 145+）
   *
   * 原理：
   * 1. Chrome 120–144：navigator.storage.persist() 在无痕模式下始终返回 false；
   *    若返回 true，可确认为正常模式。
   *    Chrome 145+：persist() 在无痕模式下也可能返回 true，不再可靠，
   *    因此跳过该信号，仅依赖配额检测。
   * 2. Chrome 120+ 无痕模式 quota 约为设备 RAM 的 10%（通常 < 1 GB）；
   *    正常模式 quota 约为磁盘空间的 60%（通常 >> 5 GB）。
   *    以 deviceMemory × 12% 作为动态阈值，最低 300 MB。
   *
   * @param {number} quota navigator.storage.estimate() 返回的 quota（字节）
   * @returns {Promise<object>}
   */
  async function detectChromiumModern(quota) {
    const chromeVersion = getChromeVersion();

    // 信号一：storage.persist() —— 仅适用于 Chrome 120–144
    // Chrome 145+ 无痕模式下 persist() 也可能返回 true，不再可靠
    if (chromeVersion < 145 && navigator.storage && typeof navigator.storage.persist === 'function') {
      try {
        const persistent = await navigator.storage.persist();
        if (persistent) {
          // 已获得持久化存储权限，必定不是无痕模式
          return { result: false, method: 'storage-persist', quota };
        }
      } catch (_) {
        // API 不可用，忽略，继续使用配额检测
      }
    }

    // 信号二：动态配额阈值
    // navigator.deviceMemory 出于隐私保护最大上报 8 GB；
    // 无痕 quota ≈ RAM × 10%；取 12% 留出安全裕量（覆盖 Chrome 各版本实现差异），
    // 最低 300 MB（兼容低内存设备，防止 deviceMemory 缺失时阈值过小）。
    // 默认值 4 GB：deviceMemory 不可读时取中等设备内存，避免阈值过高产生漏报。
    const deviceMemoryGB =
      typeof navigator.deviceMemory === 'number' && navigator.deviceMemory > 0
        ? navigator.deviceMemory
        : 4; // 默认 4 GB：无法读取时取中等设备内存估算值
    const DYNAMIC_THRESHOLD = Math.max(
      deviceMemoryGB * 0.12 * 1024 * 1024 * 1024, // RAM × 12%（比无痕实际 ~10% 多出 20% 裕量）
      300 * 1024 * 1024 // 最低 300 MB，兼容低内存/旧设备
    );

    return {
      result: quota < DYNAMIC_THRESHOLD,
      method: 'storage-quota-v2',
      quota,
      threshold: DYNAMIC_THRESHOLD,
    };
  }

  /**
   * Firefox 私有模式检测
   *
   * 原理：Firefox 私有模式禁止持久化存储，打开 IndexedDB 时会抛出 SecurityError。
   */
  async function detectFirefox() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve({ result: false, method: 'indexeddb', reason: 'IndexedDB unavailable' });
        return;
      }
      try {
        const req = window.indexedDB.open('__incognito_probe__');
        req.onerror = () =>
          resolve({ result: true, method: 'indexeddb', reason: 'open failed' });
        req.onsuccess = (e) => {
          e.target.result.close();
          // 清理测试数据库
          try {
            window.indexedDB.deleteDatabase('__incognito_probe__');
          } catch (_) {
            // ignore
          }
          resolve({ result: false, method: 'indexeddb' });
        };
      } catch (err) {
        resolve({ result: true, method: 'indexeddb', reason: err.message });
      }
    });
  }

  /**
   * Safari 私有模式检测
   *
   * 原理：Safari 私有模式下 window.requestFileSystem（旧版 FileSystem API）
   * 会立即触发错误回调；新版 Safari 则可通过 localStorage 写入测试来检测。
   */
  async function detectSafari() {
    // 方法一：旧版 Safari（< 14）FileSystem API
    const requestFileSystemAPI = window.RequestFileSystem || window.webkitRequestFileSystem;
    if (requestFileSystemAPI) {
      return new Promise((resolve) => {
        requestFileSystemAPI(
          window.TEMPORARY || 0,
          1,
          () => resolve({ result: false, method: 'filesystem' }),
          () => resolve({ result: true, method: 'filesystem' })
        );
      });
    }

    // 方法二：新版 Safari — localStorage 配额检测
    try {
      const testKey = '__safari_private_probe__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return { result: false, method: 'localstorage' };
    } catch (_) {
      return { result: true, method: 'localstorage' };
    }
  }

  /**
   * 通用后备检测（基于 sessionStorage 行为差异）
   * 某些浏览器在无痕模式下 sessionStorage 仍可用，此处仅作补充手段。
   */
  async function detectFallback() {
    // 尝试通过 BroadcastChannel 跨 Tab 通信
    // 无痕模式下同一网站的不同标签页相互隔离，但此处仅做单 Tab 判断，故不适用。
    // 后备：尝试 cookie 写入
    try {
      document.cookie = '__probe__=1; max-age=1';
      const hasCookie = document.cookie.includes('__probe__');
      if (!hasCookie) {
        return { result: true, method: 'cookie' };
      }
      return { result: false, method: 'cookie' };
    } catch (_) {
      return { result: true, method: 'cookie' };
    }
  }

  /**
   * 执行无痕模式检测
   * @returns {Promise<IncognitoResult>}
   */
  async function detect() {
    const browser = getBrowserType();
    let detection;

    switch (browser) {
      case 'chrome':
      case 'edge':
        detection = await detectChromium();
        break;
      case 'firefox':
        detection = await detectFirefox();
        break;
      case 'safari':
        detection = await detectSafari();
        break;
      default:
        // 先尝试 Chromium 方法，再尝试后备方法
        detection = await detectChromium();
        if (!detection.result && detection.reason === 'API unavailable') {
          detection = await detectFallback();
        }
    }

    return {
      isIncognito: detection.result,
      browser,
      detectionMethod: detection.method,
      details: detection,
    };
  }

  return { detect, getBrowserType, getChromeVersion };
})();

// 兼容 CommonJS / ES Module / 全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IncognitoDetector;
} else if (typeof define === 'function' && define.amd) {
  define([], () => IncognitoDetector);
} else {
  window.IncognitoDetector = IncognitoDetector;
}
