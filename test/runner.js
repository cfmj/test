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
  storage: {
    estimate: async () => ({ quota: 1024 * 1024 * 1024 * 5, usage: 0 }), // 5 GB
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

  // 测试 7：正常 Chrome 环境（大配额）→ 非无痕
  {
    global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 });
    const result = await IncognitoDetector.detect();
    assert(!result.isIncognito, 'Chrome 大配额：isIncognito 应为 false');
    assert(result.detectionMethod === 'storage-quota', '检测方法应为 storage-quota');
  }

  // 测试 8：模拟 Chrome 无痕（小配额）
  {
    global.navigator.storage.estimate = async () => ({ quota: 64 * 1024 * 1024 }); // 64 MB
    const result = await IncognitoDetector.detect();
    assert(result.isIncognito, 'Chrome 小配额：isIncognito 应为 true');
    assert(result.details.quota < 120 * 1024 * 1024, 'quota 应小于阈值');
    global.navigator.storage.estimate = async () => ({ quota: 5 * 1024 * 1024 * 1024 });
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

  // ═══════════════════════════════════════
  //  测试 RequestInterceptor
  // ═══════════════════════════════════════
  console.log('\n══ RequestInterceptor 测试 ══');

  const RequestInterceptor = require('../src/interceptor.js');

  // 测试 12：未设置检测结果时 buildHeaders 返回空对象
  {
    const headers = RequestInterceptor.buildHeaders();
    assert(typeof headers === 'object', 'buildHeaders 返回对象');
    assert(Object.keys(headers).length === 0, '未初始化时应返回空对象');
  }

  // 测试 13：设置检测结果后 buildHeaders 返回正确字段
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

  // 测试 14：自动化工具为 null 时不加 X-Automation-Tool 头
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
