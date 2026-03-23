/**
 * test/runner.js
 * Node.js 环境下对检测模块进行单元测试（模拟浏览器 API）
 *
 * 运行：node test/runner.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✅ PASS:', message);
    passed++;
  } else {
    console.error('  ❌ FAIL:', message);
    failed++;
  }
}

// ═══════════════════════════════════════
//  模拟浏览器全局 API
// ═══════════════════════════════════════
global.window = global;

const _nav = {
  webdriver: false,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  plugins: [{ name: 'Chrome PDF Plugin' }],
  languages: ['zh-CN', 'zh'],
  deviceMemory: 4, // 4 GB
  storage: {
    estimate: async () => ({ quota: 1024 * 1024 * 1024 * 5, usage: 0 }), // 5 GB
    persist: async () => false,
  },
  connection: null,
};
// Node.js 中 navigator 是只读属性，需用 defineProperty 覆盖
Object.defineProperty(global, 'navigator', { value: _nav, writable: true, configurable: true });

global.screen = { width: 1920, height: 1080 };
global.document = {};

// ═══════════════════════════════════════
//  测试 AutomationDetector
// ═══════════════════════════════════════
console.log('\n══ AutomationDetector 测试 ══');

const AutomationDetector = require('../src/automation.js');

(async () => {
  // 测试 1：正常环境 → 不应检测到自动化
  {
    const result = await AutomationDetector.detect();
    assert(!result.isAutomated, '正常环境：isAutomated 应为 false');
    assert(result.automationTool === null, '正常环境：automationTool 应为 null');
    assert(Array.isArray(result.triggeredChecks), 'triggeredChecks 应为数组');
    assert(result.triggeredChecks.length === 0, '正常环境：triggeredChecks 应为空');
  }

  // 测试 2：模拟 navigator.webdriver = true
  {
    global.navigator.webdriver = true;
    const result = await AutomationDetector.detect();
    assert(result.isAutomated, 'webdriver=true：isAutomated 应为 true');
    assert(result.triggeredChecks.includes('webdriver'), 'triggeredChecks 应含 webdriver');
    global.navigator.webdriver = false;
  }

  // 测试 3：模拟 PhantomJS
  {
    global.window.callPhantom = () => {};
    const result = await AutomationDetector.detect();
    assert(result.isAutomated, 'PhantomJS 注入：isAutomated 应为 true');
    assert(result.automationTool === 'PhantomJS', 'automationTool 应为 PhantomJS');
    delete global.window.callPhantom;
  }

  // 测试 4：模拟 Playwright
  {
    global.window.__playwright = {};
    const result = await AutomationDetector.detect();
    assert(result.isAutomated, 'Playwright 注入：isAutomated 应为 true');
    assert(result.automationTool === 'Playwright', 'automationTool 应为 Playwright');
    delete global.window.__playwright;
  }

  // 测试 5：模拟 Cypress
  {
    global.window.Cypress = {};
    const result = await AutomationDetector.detect();
    assert(result.isAutomated, 'Cypress 注入：isAutomated 应为 true');
    assert(result.automationTool === 'Cypress', 'automationTool 应为 Cypress');
    delete global.window.Cypress;
  }

  // 测试 6：模拟 Headless User-Agent
  {
    const origUA = global.navigator.userAgent;
    global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';
    const result = await AutomationDetector.detect();
    assert(result.isAutomated, 'HeadlessChrome UA：isAutomated 应为 true');
    assert(result.triggeredChecks.includes('headlessUserAgent'), 'triggeredChecks 含 headlessUserAgent');
    global.navigator.userAgent = origUA;
  }

  // ═══════════════════════════════════════
  //  测试 IncognitoDetector
  // ═══════════════════════════════════════
  console.log('\n══ IncognitoDetector 测试 ══');

  const IncognitoDetector = require('../src/incognito.js');

  // 测试 7：正常 Chrome 120 环境（大配额）→ 非无痕
  {
    global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 });
    global.navigator.storage.persist = async () => false;
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 120 大配额：isIncognito 应为 false');
    assert(result.detectionMethod === 'storage-quota-v2', 'Chrome 120+ 检测方法应为 storage-quota-v2');
  }

  // 测试 8：模拟 Chrome 120 无痕（64 MB 小配额，仍低于动态阈值）
  {
    global.navigator.storage.estimate = async () => ({ quota: 64 * 1024 * 1024 }); // 64 MB
    global.navigator.storage.persist = async () => false;
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 120 小配额（64 MB）：isIncognito 应为 true');
    assert(result.details.quota < 120 * 1024 * 1024, 'quota 应小于 120 MB');
    global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 });
    global.navigator.storage.persist = async () => false;
  }

  // 测试 9：getBrowserType 正确识别 Chrome
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    assert(IncognitoDetector.getBrowserType() === 'chrome', 'Chrome UA 识别');
  }

  // 测试 10：getBrowserType 正确识别 Edge
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    assert(IncognitoDetector.getBrowserType() === 'edge', 'Edge UA 识别');
  }

  // 测试 11：getBrowserType 正确识别 Firefox
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
    assert(IncognitoDetector.getBrowserType() === 'firefox', 'Firefox UA 识别');
  }

  // 测试 12：getChromeVersion 正确提取版本号
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    assert(IncognitoDetector.getChromeVersion() === 145, 'Chrome 145 版本号提取正确');
  }

  // 测试 13：getChromeVersion 对非 Chrome UA 返回 0
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
    assert(IncognitoDetector.getChromeVersion() === 0, '非 Chrome UA getChromeVersion 应返回 0');
    // 恢复 Chrome UA
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
  }

  // —— Chrome 145 专项测试 ——

  // 测试 14：Chrome 145 正常模式（大配额，约磁盘的 60%）→ 非无痕
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 8;
    global.navigator.storage.estimate = async () => ({ quota: 80 * 1024 * 1024 * 1024 }); // 80 GB
    global.navigator.storage.persist = async () => false;
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 145 大配额（80 GB）：isIncognito 应为 false');
    assert(result.detectionMethod === 'storage-quota-v2', 'Chrome 145 检测方法应为 storage-quota-v2');
  }

  // 测试 15：Chrome 145 无痕模式（quota ≈ RAM × 10%，约 800 MB = 8 GB × 10%）→ 是无痕
  // 该配额远高于旧阈值 120 MB，验证旧代码在 145 上的失效场景已被修复
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 8;
    global.navigator.storage.estimate = async () => ({ quota: 800 * 1024 * 1024 }); // 800 MB
    global.navigator.storage.persist = async () => false;
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 145 无痕 800 MB 配额：isIncognito 应为 true（修复前会误判为 false）');
    assert(result.detectionMethod === 'storage-quota-v2', '检测方法应为 storage-quota-v2');
  }

  // 测试 16：Chrome 145 无痕模式 persist() 返回 true（Chrome 145 行为变更）→ 应通过配额检测为无痕
  // Chrome 145 无痕模式下 persist() 也可能返回 true，不再可靠，应忽略 persist 信号
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 8;
    global.navigator.storage.estimate = async () => ({ quota: 500 * 1024 * 1024 }); // 500 MB（低于动态阈值：8 GB × 12% ≈ 983 MB）
    global.navigator.storage.persist = async () => true; // 无痕模式下也返回 true（Chrome 145 新行为）
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 145 无痕 persist=true 低配额：isIncognito 应为 true（persist 不可靠）');
    assert(result.detectionMethod === 'storage-quota-v2', '检测方法应为 storage-quota-v2（跳过 persist）');
  }

  // 测试 17：Chrome 145 正常模式 persist() 返回 true + 大配额 → 非无痕
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 8;
    global.navigator.storage.estimate = async () => ({ quota: 80 * 1024 * 1024 * 1024 }); // 80 GB
    global.navigator.storage.persist = async () => true;
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 145 正常模式 persist=true 大配额：isIncognito 应为 false');
    assert(result.detectionMethod === 'storage-quota-v2', '检测方法应为 storage-quota-v2');
  }

  // 测试 18：Chrome 130（120-144 范围）persist() 返回 true → 仍可信赖，确定非无痕
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 4;
    global.navigator.storage.estimate = async () => ({ quota: 500 * 1024 * 1024 }); // 500 MB
    global.navigator.storage.persist = async () => true; // Chrome 130 中 persist=true 仍可靠
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 130 persist=true：isIncognito 应为 false（persist 仍可靠）');
    assert(result.detectionMethod === 'storage-persist', '检测方法应为 storage-persist');
  }

  // 测试 19：Chrome 145 无痕、低配额（100 MB）→ 是无痕（向下兼容）
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    global.navigator.deviceMemory = 4;
    global.navigator.storage.estimate = async () => ({ quota: 100 * 1024 * 1024 }); // 100 MB
    global.navigator.storage.persist = async () => false;
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 145 无痕 100 MB 配额：isIncognito 应为 true');
  }

  // 测试 20：Chrome 119（旧版）无痕检测仍使用 120 MB 阈值
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    global.navigator.storage.estimate = async () => ({ quota: 64 * 1024 * 1024 }); // 64 MB
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 119 小配额（64 MB）：isIncognito 应为 true');
    assert(result.detectionMethod === 'storage-quota', 'Chrome 119 检测方法应为 storage-quota');
  }

  // 测试 21：Chrome 119（旧版）正常模式
  {
    global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 }); // 5 GB
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 119 大配额（5 GB）：isIncognito 应为 false');
    assert(result.detectionMethod === 'storage-quota', 'Chrome 119 正常模式检测方法应为 storage-quota');
  }

  // 恢复到默认 Chrome 120 UA 供后续测试使用
  global.navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  global.navigator.deviceMemory = 4;
  global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 });
  global.navigator.storage.persist = async () => false;

  // ═══════════════════════════════════════
  //  测试 RequestInterceptor
  // ═══════════════════════════════════════
  console.log('\n══ RequestInterceptor 测试 ══');

  const RequestInterceptor = require('../src/interceptor.js');

  // 测试 20：未设置检测结果时 buildHeaders 返回空对象
  {
    const headers = RequestInterceptor.buildHeaders();
    assert(typeof headers === 'object', 'buildHeaders 返回对象');
    assert(Object.keys(headers).length === 0, '未初始化时应返回空对象');
  }

  // 测试 21：设置检测结果后 buildHeaders 返回正确字段
  {
    RequestInterceptor.setDetectionResult({
      automation: { isAutomated: true, automationTool: 'Selenium/ChromeDriver' },
      incognito: { isIncognito: false, browser: 'chrome' },
    });
    const headers = RequestInterceptor.buildHeaders();
    assert(headers['X-Automation-Detected'] === 'true', 'X-Automation-Detected 应为 "true"');
    assert(headers['X-Automation-Tool'] === 'Selenium/ChromeDriver', 'X-Automation-Tool 正确');
    assert(headers['X-Incognito-Detected'] === 'false', 'X-Incognito-Detected 应为 "false"');
    assert(headers['X-Browser-Type'] === 'chrome', 'X-Browser-Type 应为 "chrome"');
    assert(typeof headers['X-Detection-Timestamp'] === 'string', 'X-Detection-Timestamp 应为字符串');
  }

  // 测试 22：自动化工具为 null 时不加 X-Automation-Tool 头
  {
    RequestInterceptor.setDetectionResult({
      automation: { isAutomated: false, automationTool: null },
      incognito: { isIncognito: false, browser: 'chrome' },
    });
    const headers = RequestInterceptor.buildHeaders();
    assert(headers['X-Automation-Detected'] === 'false', 'X-Automation-Detected 应为 "false"');
    assert(!('X-Automation-Tool' in headers), '非自动化环境不应有 X-Automation-Tool');
  }

  // ═══════════════════════════════════════
  //  汇总
  // ═══════════════════════════════════════
  console.log(`\n══ 测试结果 ══`);
  console.log(`  通过：${passed} / 失败：${failed}`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('  🎉 全部测试通过！');
  }
})();
