/**
 * index.js
 * WebGuard —— 自动化 & 无痕环境检测库入口
 *
 * 用法（浏览器全局）：
 *   <script src="src/automation.js"></script>
 *   <script src="src/incognito.js"></script>
 *   <script src="src/interceptor.js"></script>
 *   <script src="src/index.js"></script>
 *   <script>
 *     WebGuard.init({ reportUrl: '/api/report' }).then(result => {
 *       console.log(result);
 *     });
 *   </script>
 *
 * 用法（CommonJS / Bundler）：
 *   const WebGuard = require('./src/index');
 *   WebGuard.init().then(console.log);
 */

'use strict';

/* eslint-disable no-undef */
const WebGuard = (() => {
  /** 默认配置 */
  const DEFAULT_OPTIONS = {
    /**
     * 是否自动安装 HTTP 拦截器
     * 安装后所有 fetch / XHR 请求将携带检测结果请求头
     */
    installInterceptor: true,

    /**
     * 可选：检测完成后主动上报的接口地址
     * 若不填则只在后续请求中携带请求头，不主动发送上报请求
     */
    reportUrl: null,

    /**
     * 可选：上报请求的额外请求头
     */
    extraReportHeaders: {},

    /**
     * 是否在控制台输出检测结果（调试用）
     */
    debug: false,
  };

  /**
   * 初始化并执行检测
   * @param {Partial<typeof DEFAULT_OPTIONS>} options
   * @returns {Promise<DetectionResult>}
   */
  async function init(options = {}) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options);

    // 1. 并行执行自动化检测 & 无痕模式检测
    const [automationResult, incognitoResult] = await Promise.all([
      AutomationDetector.detect(),
      IncognitoDetector.detect(),
    ]);

    const result = {
      automation: automationResult,
      incognito: incognitoResult,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    if (opts.debug) {
      console.group('[WebGuard] Detection Result');
      console.log('Automation:', automationResult);
      console.log('Incognito:', incognitoResult);
      console.groupEnd();
    }

    // 2. 安装 HTTP 拦截器
    if (opts.installInterceptor) {
      RequestInterceptor.setDetectionResult(result);
      RequestInterceptor.install();
    }

    // 3. 主动上报（可选）
    if (opts.reportUrl) {
      await report(opts.reportUrl, result, opts.extraReportHeaders);
    }

    return result;
  }

  /**
   * 主动向指定地址上报检测结果
   * @param {string} url
   * @param {DetectionResult} result
   * @param {Record<string,string>} extraHeaders
   */
  async function report(url, result, extraHeaders = {}) {
    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
      },
      extraHeaders
    );

    // 上报请求头已由拦截器自动追加，此处直接发送 body
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(result),
      });
      return resp;
    } catch (err) {
      console.warn('[WebGuard] Report failed:', err.message);
      return null;
    }
  }

  /**
   * 获取当前检测结果对应的请求头对象（便于手动追加）
   * @returns {Record<string,string>}
   */
  function getDetectionHeaders() {
    return RequestInterceptor.buildHeaders();
  }

  /**
   * 卸载 HTTP 拦截器
   */
  function destroy() {
    RequestInterceptor.uninstall();
  }

  return { init, report, getDetectionHeaders, destroy };
})();

// 兼容 CommonJS / ES Module / 全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebGuard;
} else if (typeof define === 'function' && define.amd) {
  define([], () => WebGuard);
} else {
  window.WebGuard = WebGuard;
}
