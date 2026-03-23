/**
 * automation.js
 * 自动化环境检测模块
 *
 * 检测浏览器是否在以下自动化工具中运行：
 * - Selenium / WebDriver
 * - Puppeteer / Playwright (Headless Chrome)
 * - PhantomJS
 * - Nightmare.js
 * - Cypress
 * - 其他无头浏览器
 */

'use strict';

const AutomationDetector = (() => {
  /**
   * 检测 navigator.webdriver 属性
   * WebDriver 标准要求在自动化环境中将此属性设为 true
   */
  function checkWebDriver() {
    return navigator.webdriver === true;
  }

  /**
   * 检测 PhantomJS 特有属性
   */
  function checkPhantomJS() {
    return !!(window.callPhantom || window._phantom || window.phantom);
  }

  /**
   * 检测 Nightmare.js 特有属性
   */
  function checkNightmare() {
    return !!window.__nightmare;
  }

  /**
   * 检测 Cypress 测试框架
   */
  function checkCypress() {
    return !!(window.Cypress || window.cypress);
  }

  /**
   * 检测 Selenium / ChromeDriver 注入的属性
   * ChromeDriver 会在 document 对象上注入特殊标识属性。
   * 注意：$cdc_asdjflasutopfhvcZLmcfl_ 是 ChromeDriver 目前使用的属性名，
   * 实际上该属性名由固定前缀 "$cdc_" 加随机字符组成，不同版本可能不同。
   */
  function checkSeleniumArtifacts() {
    const seleniumProps = [
      '$cdc_asdjflasutopfhvcZLmcfl_', // ChromeDriver
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__webdriver_script_fn',
      '__driver_evaluate',
      '__selenium_unwrapped',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_script_func',
    ];
    return seleniumProps.some(
      (prop) =>
        typeof document[prop] !== 'undefined' ||
        typeof window[prop] !== 'undefined'
    );
  }

  /**
   * 检测 User-Agent 中的无头浏览器标识
   */
  function checkHeadlessUserAgent() {
    const ua = navigator.userAgent;
    return /HeadlessChrome|headless/i.test(ua);
  }

  /**
   * 检测插件列表是否为空
   * 真实浏览器通常至少有一个插件；无头浏览器插件列表通常为空
   */
  function checkEmptyPlugins() {
    return navigator.plugins.length === 0;
  }

  /**
   * 检测语言列表是否异常
   * 自动化环境中 navigator.languages 可能为空数组
   */
  function checkEmptyLanguages() {
    return !navigator.languages || navigator.languages.length === 0;
  }

  /**
   * 检测屏幕尺寸异常
   * 无头浏览器默认分辨率有时为 800×600 或 0×0
   */
  function checkSuspiciousScreenDimensions() {
    if (screen.width === 0 || screen.height === 0) return true;
    if (window.outerWidth === 0 && window.outerHeight === 0) return true;
    return false;
  }

  /**
   * 检测 connection.rtt（往返时延）
   * 无头浏览器有时会缺少此属性，或值为 0
   */
  function checkConnectionRtt() {
    if (navigator.connection && navigator.connection.rtt === 0) return true;
    return false;
  }

  /**
   * 检测 chrome 对象内的 Automation 标记
   * Puppeteer 早期版本会暴露 chrome.app 等属性
   */
  function checkPuppeteer() {
    // Puppeteer 在 --enable-automation 标志下运行时 navigator.webdriver === true
    // 此处仅作辅助判断
    if (typeof window.chrome !== 'undefined') {
      // Chrome 非自动化时，chrome.runtime 存在
      // Puppeteer 默认关闭 Runtime，此属性可能缺失
      if (
        window.chrome &&
        !window.chrome.runtime &&
        !window.chrome.loadTimes
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检测 Playwright 特有属性
   */
  function checkPlaywright() {
    return !!(
      window.__playwright ||
      window.__pw_manual ||
      window.__PW_inspect__
    );
  }

  /**
   * 运行所有检测并返回结果
   * @returns {Promise<AutomationResult>}
   */
  async function detect() {
    const checks = {
      webdriver: checkWebDriver(),
      phantomjs: checkPhantomJS(),
      nightmare: checkNightmare(),
      cypress: checkCypress(),
      seleniumArtifacts: checkSeleniumArtifacts(),
      headlessUserAgent: checkHeadlessUserAgent(),
      emptyPlugins: checkEmptyPlugins(),
      emptyLanguages: checkEmptyLanguages(),
      suspiciousScreenDimensions: checkSuspiciousScreenDimensions(),
      connectionRtt: checkConnectionRtt(),
      puppeteer: checkPuppeteer(),
      playwright: checkPlaywright(),
    };

    const triggeredChecks = Object.keys(checks).filter((k) => checks[k]);
    const isAutomated = triggeredChecks.length > 0;

    // 推断自动化工具名称
    let automationTool = null;
    if (isAutomated) {
      if (checks.phantomjs) automationTool = 'PhantomJS';
      else if (checks.nightmare) automationTool = 'Nightmare.js';
      else if (checks.cypress) automationTool = 'Cypress';
      else if (checks.playwright) automationTool = 'Playwright';
      else if (checks.seleniumArtifacts) automationTool = 'Selenium/ChromeDriver';
      else if (checks.puppeteer) automationTool = 'Puppeteer';
      else if (checks.webdriver) automationTool = 'WebDriver';
      else if (checks.headlessUserAgent) automationTool = 'Headless Browser';
      else automationTool = 'Unknown Automation';
    }

    return {
      isAutomated,
      automationTool,
      triggeredChecks,
      checks,
    };
  }

  return { detect };
})();

// 兼容 CommonJS / ES Module / 全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutomationDetector;
} else if (typeof define === 'function' && define.amd) {
  define([], () => AutomationDetector);
} else {
  window.AutomationDetector = AutomationDetector;
}
