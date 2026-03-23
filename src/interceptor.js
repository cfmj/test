/**
 * interceptor.js
 * HTTP 请求拦截器 —— 将检测结果注入自定义请求头
 *
 * 拦截 window.fetch 与 XMLHttpRequest，对所有出站请求追加：
 *   X-Automation-Detected  : "true" | "false"
 *   X-Automation-Tool      : 工具名称（仅在检测到自动化时存在）
 *   X-Incognito-Detected   : "true" | "false"
 *   X-Browser-Type         : 浏览器类型
 *   X-Detection-Timestamp  : ISO 8601 时间戳
 */

'use strict';

const RequestInterceptor = (() => {
  let _detectionResult = null;
  let _installed = false;

  /** 保存检测结果供拦截器读取 */
  function setDetectionResult(result) {
    _detectionResult = result;
  }

  /** 根据检测结果构建需要追加的请求头键值对 */
  function buildHeaders() {
    if (!_detectionResult) return {};

    const headers = {
      'X-Automation-Detected': String(_detectionResult.automation.isAutomated),
      'X-Incognito-Detected': String(_detectionResult.incognito.isIncognito),
      'X-Browser-Type': _detectionResult.incognito.browser || 'unknown',
      'X-Detection-Timestamp': new Date().toISOString(),
    };

    if (_detectionResult.automation.isAutomated && _detectionResult.automation.automationTool) {
      headers['X-Automation-Tool'] = _detectionResult.automation.automationTool;
    }

    return headers;
  }

  /**
   * 拦截 window.fetch
   */
  function interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const extraHeaders = buildHeaders();
      if (Object.keys(extraHeaders).length === 0) {
        return originalFetch.call(this, input, init);
      }

      const newInit = Object.assign({}, init);
      if (newInit.headers instanceof Headers) {
        Object.entries(extraHeaders).forEach(([k, v]) => newInit.headers.set(k, v));
      } else if (newInit.headers && typeof newInit.headers === 'object') {
        newInit.headers = Object.assign({}, newInit.headers, extraHeaders);
      } else {
        newInit.headers = extraHeaders;
      }

      return originalFetch.call(this, input, newInit);
    };

    // 保存还原函数
    window.fetch._original = originalFetch;
  }

  /**
   * 拦截 XMLHttpRequest
   */
  function interceptXHR() {
    const OriginalOpen = XMLHttpRequest.prototype.open;
    const OriginalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (...args) {
      this._interceptorHeaders = buildHeaders();
      return OriginalOpen.apply(this, args);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const headers = this._interceptorHeaders || {};
      Object.entries(headers).forEach(([k, v]) => {
        try {
          this.setRequestHeader(k, v);
        } catch (_) {
          // setRequestHeader 在某些状态下会抛出，忽略即可
        }
      });
      return OriginalSend.apply(this, args);
    };

    // 保存原始引用
    XMLHttpRequest.prototype.open._original = OriginalOpen;
    XMLHttpRequest.prototype.send._original = OriginalSend;
  }

  /**
   * 安装拦截器（幂等）
   */
  function install() {
    if (_installed) return;
    interceptFetch();
    interceptXHR();
    _installed = true;
  }

  /**
   * 卸载拦截器（恢复原始实现）
   */
  function uninstall() {
    if (!_installed) return;

    if (window.fetch && window.fetch._original) {
      window.fetch = window.fetch._original;
    }

    if (
      XMLHttpRequest.prototype.open &&
      XMLHttpRequest.prototype.open._original
    ) {
      XMLHttpRequest.prototype.open = XMLHttpRequest.prototype.open._original;
      XMLHttpRequest.prototype.send = XMLHttpRequest.prototype.send._original;
    }

    _installed = false;
  }

  return { install, uninstall, setDetectionResult, buildHeaders };
})();

// 兼容 CommonJS / ES Module / 全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RequestInterceptor;
} else if (typeof define === 'function' && define.amd) {
  define([], () => RequestInterceptor);
} else {
  window.RequestInterceptor = RequestInterceptor;
}
