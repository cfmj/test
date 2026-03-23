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
   * Chrome / Edge 无痕模式检测
   *
   * 原理：Chrome 无痕模式下，navigator.storage.estimate() 返回的
   * quota（存储配额）被限制在约 120 MB 以内；正常模式下为数 GB。
   *
   * 参考：https://developer.chrome.com/docs/privacy-security/storage-quota
   */
  async function detectChromium() {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return { result: false, method: 'storage-quota', reason: 'API unavailable' };
    }
    try {
      const { quota } = await navigator.storage.estimate();
      // 120 MB 阈值（字节）
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

  return { detect, getBrowserType };
})();

// 兼容 CommonJS / ES Module / 全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IncognitoDetector;
} else if (typeof define === 'function' && define.amd) {
  define([], () => IncognitoDetector);
} else {
  window.IncognitoDetector = IncognitoDetector;
}
