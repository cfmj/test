# WebGuard 技术文档

## Web 自动化环境 & 无痕模式检测方案

**版本**：1.0.0  
**日期**：2026-03-23  
**适用范围**：面向浏览器端的 JavaScript 应用

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [整体架构](#2-整体架构)
3. [自动化环境检测](#3-自动化环境检测)
4. [无痕 / 隐私模式检测](#4-无痕--隐私模式检测)
5. [HTTP 请求头注入机制](#5-http-请求头注入机制)
6. [接入指南](#6-接入指南)
7. [自定义请求头字段说明](#7-自定义请求头字段说明)
8. [参考开源项目](#8-参考开源项目)
9. [常见问题](#9-常见问题)
10. [安全说明](#10-安全说明)

---

## 1. 背景与目标

### 1.1 背景

随着自动化测试工具（Selenium、Puppeteer、Playwright 等）和无头浏览器（Headless Chrome 等）的广泛应用，恶意爬虫、刷量机器人以及绕过风控的自动化脚本已对 Web 应用构成威胁。与此同时，用户使用无痕 / 隐私模式可能影响 A/B 实验、用户行为分析及会话管理等功能。

### 1.2 目标

- 在客户端（浏览器）实时检测当前会话是否运行于自动化环境或无痕模式。
- 将检测结论注入后续所有 HTTP 请求的自定义请求头，供服务端进一步鉴别与处理。
- 最小化对用户体验和正常业务逻辑的影响。

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器运行时                          │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐                   │
│  │ automation.js│   │ incognito.js │  ← 并行检测        │
│  └──────┬───────┘   └──────┬───────┘                   │
│         │                  │                            │
│         └────────┬─────────┘                            │
│                  ▼                                       │
│           ┌────────────┐                                 │
│           │  index.js  │  ← 汇总结果、调度流程           │
│           └─────┬──────┘                                 │
│                 │                                        │
│                 ▼                                        │
│        ┌──────────────────┐                              │
│        │ interceptor.js   │  ← 拦截 fetch / XHR          │
│        │ 注入自定义请求头  │                              │
│        └────────┬─────────┘                              │
│                 │                                        │
└─────────────────┼───────────────────────────────────────┘
                  │  HTTP Request + X-Automation-Detected
                  │              + X-Incognito-Detected
                  ▼              + X-Automation-Tool
             后端服务器            + X-Browser-Type
                                  + X-Detection-Timestamp
```

### 2.1 文件说明

| 文件 | 职责 |
|------|------|
| `src/automation.js` | 自动化环境检测，返回检测结论与触发项列表 |
| `src/incognito.js` | 无痕 / 隐私模式检测，兼容 Chrome/Firefox/Safari/Edge |
| `src/interceptor.js` | 拦截 `window.fetch` 及 `XMLHttpRequest`，注入请求头 |
| `src/index.js` | 统一入口，并行调度检测、安装拦截器、可选上报 |
| `demo/index.html` | 可视化演示页面 |

---

## 3. 自动化环境检测

### 3.1 检测项一览

| 检测项 | 技术原理 | 可信度 |
|--------|----------|--------|
| `webdriver` | `navigator.webdriver === true`（W3C WebDriver 标准） | ⭐⭐⭐⭐⭐ |
| `seleniumArtifacts` | 检测 ChromeDriver 注入的属性（如 `$cdc_asdjflasutopfhvcZLmcfl_`） | ⭐⭐⭐⭐⭐ |
| `phantomjs` | `window.callPhantom / window._phantom / window.phantom` | ⭐⭐⭐⭐⭐ |
| `playwright` | `window.__playwright / window.__pw_manual` | ⭐⭐⭐⭐⭐ |
| `nightmare` | `window.__nightmare` | ⭐⭐⭐⭐⭐ |
| `cypress` | `window.Cypress / window.cypress` | ⭐⭐⭐⭐⭐ |
| `headlessUserAgent` | User-Agent 中包含 `HeadlessChrome` 或 `headless` | ⭐⭐⭐⭐ |
| `emptyPlugins` | `navigator.plugins.length === 0` | ⭐⭐⭐ |
| `emptyLanguages` | `navigator.languages.length === 0` | ⭐⭐⭐ |
| `suspiciousScreenDimensions` | `screen.width/height === 0` 或 `outerWidth/outerHeight === 0` | ⭐⭐⭐ |
| `puppeteer` | `chrome.runtime` 缺失但 `window.chrome` 存在 | ⭐⭐ |
| `connectionRtt` | `navigator.connection.rtt === 0` | ⭐⭐ |

> **评分说明**：⭐⭐⭐⭐⭐ 为精确判断，⭐⭐ 为辅助参考（需结合其他项综合判断）。

### 3.2 结果数据结构

```json
{
  "isAutomated": true,
  "automationTool": "Selenium/ChromeDriver",
  "triggeredChecks": ["webdriver", "seleniumArtifacts"],
  "checks": {
    "webdriver": true,
    "seleniumArtifacts": true,
    "phantomjs": false,
    "playwright": false,
    "nightmare": false,
    "cypress": false,
    "headlessUserAgent": false,
    "emptyPlugins": false,
    "emptyLanguages": false,
    "suspiciousScreenDimensions": false,
    "puppeteer": false,
    "connectionRtt": false
  }
}
```

### 3.3 工具识别优先级

当多个检测项同时触发时，按以下优先级识别工具名称：

```
PhantomJS > Nightmare.js > Cypress > Playwright > Selenium/ChromeDriver > Puppeteer > WebDriver > Headless Browser > Unknown Automation
```

---

## 4. 无痕 / 隐私模式检测

### 4.1 各浏览器检测策略

#### Chrome / Chromium / Edge

**方法**：`Storage Quota（存储配额）检测`

```javascript
const { quota } = await navigator.storage.estimate();
const isIncognito = quota < 120 * 1024 * 1024; // 小于 120 MB
```

**原理**：Chrome 无痕模式下，浏览器会将存储配额限制在约 120 MB（实际值因版本而异，通常为 64 MB–120 MB），而正常模式下配额为可用磁盘空间的一定比例（通常数 GB）。

**可信度**：⭐⭐⭐⭐⭐（Chrome 76+ 版本稳定）

**参考**：  
- [Chrome 源码 QuotaManagerImpl](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/storage/browser/quota/quota_manager_impl.cc)

---

#### Firefox

**方法**：`IndexedDB 错误检测`

```javascript
const req = window.indexedDB.open('__probe__');
req.onerror = () => { /* 私有模式 */ };
req.onsuccess = () => { /* 正常模式 */ };
```

**原理**：Firefox 私有模式下禁止持久化存储，打开 IndexedDB 时会触发 `SecurityError`。

**可信度**：⭐⭐⭐⭐（Firefox 79+ 版本稳定）

---

#### Safari

**方法一（旧版 < 14）**：`FileSystem API 错误检测`

```javascript
window.webkitRequestFileSystem(TEMPORARY, 1,
  () => { /* 正常模式 */ },
  () => { /* 私有模式 */ }
);
```

**方法二（新版 ≥ 14）**：`localStorage 写入检测`

Safari 14+ 的私有模式允许 localStorage 使用，但空间受限，可结合写入测试判断。

**可信度**：⭐⭐⭐（Safari 版本差异较大）

---

#### 通用后备方法

Cookie 写入检测（部分浏览器特定配置下有效）：

```javascript
document.cookie = '__probe__=1; max-age=1';
const hasCookie = document.cookie.includes('__probe__');
```

---

### 4.2 结果数据结构

```json
{
  "isIncognito": true,
  "browser": "chrome",
  "detectionMethod": "storage-quota",
  "details": {
    "result": true,
    "method": "storage-quota",
    "quota": 66060288,
    "threshold": 125829120
  }
}
```

---

## 5. HTTP 请求头注入机制

### 5.1 拦截原理

`interceptor.js` 通过**猴子补丁（Monkey Patching）**覆盖全局 `fetch` 函数与 `XMLHttpRequest.prototype.open/send` 方法，在发出请求前追加自定义请求头。

```
请求发起
   │
   ▼
拦截 fetch / XHR
   │
   ▼
调用 buildHeaders() 生成检测头
   │
   ▼
合并到原始请求头（不覆盖业务自定义头）
   │
   ▼
发起真实 HTTP 请求（携带检测头）
```

### 5.2 fetch 拦截实现

```javascript
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  const init2 = Object.assign({}, init);
  // 合并检测头，支持 Headers 对象 / 普通对象 / 无头
  const extra = buildHeaders();
  if (init2.headers instanceof Headers) {
    Object.entries(extra).forEach(([k, v]) => init2.headers.set(k, v));
  } else {
    init2.headers = Object.assign({}, init2.headers, extra);
  }
  return originalFetch.call(this, input, init2);
};
```

### 5.3 XHR 拦截实现

```javascript
const OriginalOpen = XMLHttpRequest.prototype.open;
const OriginalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (...args) {
  this._detectionHeaders = buildHeaders(); // 缓存到实例
  return OriginalOpen.apply(this, args);
};

XMLHttpRequest.prototype.send = function (...args) {
  Object.entries(this._detectionHeaders || {}).forEach(([k, v]) => {
    this.setRequestHeader(k, v);
  });
  return OriginalSend.apply(this, args);
};
```

---

## 6. 接入指南

### 6.1 CDN / 直接引入（推荐）

在页面 `<head>` 或 `<body>` 底部引入脚本，并尽早调用 `WebGuard.init()`：

```html
<script src="path/to/automation.js"></script>
<script src="path/to/incognito.js"></script>
<script src="path/to/interceptor.js"></script>
<script src="path/to/index.js"></script>
<script>
  WebGuard.init({
    installInterceptor: true,  // 自动注入请求头（默认 true）
    reportUrl: '/api/security/report',  // 可选：主动上报接口
    debug: false,
  }).then(result => {
    console.log('检测完成:', result);
    // result.automation.isAutomated  → boolean
    // result.incognito.isIncognito   → boolean
  });
</script>
```

### 6.2 使用 Bundler（Webpack / Vite）

```javascript
import AutomationDetector from './src/automation';
import IncognitoDetector   from './src/incognito';
import RequestInterceptor  from './src/interceptor';
import WebGuard            from './src/index';

WebGuard.init({ installInterceptor: true, debug: true });
```

### 6.3 服务端接收与处理示例（Node.js / Express）

```javascript
app.use((req, res, next) => {
  const isAutomated = req.headers['x-automation-detected'] === 'true';
  const isIncognito = req.headers['x-incognito-detected'] === 'true';
  const tool        = req.headers['x-automation-tool'] || 'none';
  const browser     = req.headers['x-browser-type'] || 'unknown';

  if (isAutomated) {
    console.warn(`[Risk] Automated request detected (${tool}), IP: ${req.ip}`);
    // 根据业务需要决定：拦截 / 限流 / 记录日志
  }

  req.detectionInfo = { isAutomated, isIncognito, tool, browser };
  next();
});
```

### 6.4 配置项说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `installInterceptor` | `boolean` | `true` | 是否安装 HTTP 拦截器 |
| `reportUrl` | `string \| null` | `null` | 主动上报接口地址（POST JSON） |
| `extraReportHeaders` | `object` | `{}` | 上报请求的额外请求头 |
| `debug` | `boolean` | `false` | 在控制台输出详细检测日志 |

---

## 7. 自定义请求头字段说明

| 请求头名称 | 值示例 | 说明 |
|-----------|--------|------|
| `X-Automation-Detected` | `"true"` / `"false"` | 是否检测到自动化环境 |
| `X-Automation-Tool` | `"Selenium/ChromeDriver"` | 自动化工具名称（仅在检测到时存在） |
| `X-Incognito-Detected` | `"true"` / `"false"` | 是否处于无痕 / 隐私模式 |
| `X-Browser-Type` | `"chrome"` / `"firefox"` / `"safari"` / `"edge"` / `"unknown"` | 浏览器类型 |
| `X-Detection-Timestamp` | `"2026-03-23T07:00:00.000Z"` | 检测时间（ISO 8601 UTC） |

---

## 8. 参考开源项目

以下开源库提供了更高级的浏览器指纹与机器人检测能力，可作为进阶方案：

| 项目 | 仓库 | 说明 |
|------|------|------|
| **FingerprintJS** | [fingerprintjs/fingerprintjs](https://github.com/fingerprintjs/fingerprintjs) | 免费版浏览器指纹生成库，可结合本方案使用 |
| **BotD** | [fingerprintjs/BotD](https://github.com/fingerprintjs/BotD) | 专注于机器人检测，提供免费开源版 |
| **CreepJS** | [abrahamjuliot/creepjs](https://github.com/abrahamjuliot/creepjs) | 全面的浏览器环境可信度评分 |
| **Detect-Browser** | [DamonOehlman/detect-browser](https://github.com/DamonOehlman/detect-browser) | 轻量级浏览器类型识别库 |
| **browser-detect** | [KenACollins/browser-detect](https://github.com/KenACollins/browser-detect) | 无痕模式检测工具 |

> 本项目实现参考并综合了上述库的检测思路，以零外部依赖的方式提供核心功能。

---

## 9. 常见问题

### Q1：`navigator.webdriver` 能被绕过吗？

可以。部分自动化工具（如新版 Puppeteer）提供了 `--disable-blink-features=AutomationControlled` 标志来隐藏 `navigator.webdriver`。因此本方案使用**多维度组合检测**，单一项被绕过不影响整体判断。

### Q2：Chrome 版本更新后无痕检测失效怎么办？

Chrome 团队有时会调整无痕模式的存储配额阈值。建议：
- 定期在最新版 Chrome 中验证 `navigator.storage.estimate()` 返回的 `quota` 值
- 将阈值配置化，方便快速调整

### Q3：HTTP 拦截器是否影响页面性能？

极小。拦截器仅在请求发起时追加约 5 个 HTTP 头字段，无阻塞操作，对性能几乎无影响（< 0.1ms/request）。

### Q4：如何在 CSP 严格模式下使用？

本库为纯 JavaScript，无需 `eval` 或动态脚本注入，与任何 `Content-Security-Policy` 配置兼容。

### Q5：可以只检测，不注入请求头吗？

可以，将 `installInterceptor: false` 传入 `init()` 即可：

```javascript
const result = await WebGuard.init({ installInterceptor: false });
// 手动处理 result
```

---

## 10. 安全说明

1. **客户端检测可被绕过**：本方案的检测逻辑运行在浏览器端，具有较强对抗性的攻击者可以修改 JavaScript 或使用 DevTools 绕过。建议结合服务端风控（IP 信誉、行为分析、验证码等）形成多层防御。

2. **请求头可被伪造**：自定义请求头在客户端生成，服务端不应将其作为唯一安全判断依据，应与 IP 分析、用户行为模型等结合使用。

3. **隐私合规**：本方案不采集用户个人信息，仅检测浏览器环境特征。使用时需在隐私政策中告知用户相关数据采集行为，以符合 GDPR、《个人信息保护法》等法规要求。

4. **无持久化存储**：检测过程不写入 Cookie、localStorage 或 IndexedDB（除检测探针外，探针在检测后立即删除），不影响用户数据。

---

*© 2026 WebGuard | MIT License*
