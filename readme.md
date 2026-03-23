# WebGuard

> Web 自动化环境 & 无痕 / 隐私模式检测库

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 功能概述

- 🤖 **自动化环境检测**：识别 Selenium、Puppeteer、Playwright、PhantomJS、Cypress 等常见自动化工具
- 🕵️ **无痕模式检测**：兼容 Chrome / Edge / Firefox / Safari 的隐私模式检测
- 📡 **请求头自动注入**：检测结果自动追加到所有 `fetch` / `XHR` 请求的自定义头中
- 🔌 **零外部依赖**：纯原生 JavaScript，无需任何第三方库

---

## 快速开始

### 1. 引入脚本

```html
<script src="src/automation.js"></script>
<script src="src/incognito.js"></script>
<script src="src/interceptor.js"></script>
<script src="src/index.js"></script>
```

### 2. 初始化

```javascript
WebGuard.init({
  installInterceptor: true,       // 自动注入请求头
  reportUrl: '/api/security/report', // 可选：主动上报接口
  debug: true,
}).then(result => {
  console.log('是否自动化环境:', result.automation.isAutomated);
  console.log('是否无痕模式:  ', result.incognito.isIncognito);
});
```

初始化完成后，所有后续的 `fetch` / `XMLHttpRequest` 请求将自动携带以下请求头：

| 请求头 | 说明 |
|--------|------|
| `X-Automation-Detected` | `"true"` / `"false"` |
| `X-Automation-Tool` | 工具名称（如 `Selenium/ChromeDriver`） |
| `X-Incognito-Detected` | `"true"` / `"false"` |
| `X-Browser-Type` | `chrome` / `firefox` / `safari` / `edge` |
| `X-Detection-Timestamp` | ISO 8601 时间戳 |

---

## 目录结构

```
.
├── src/
│   ├── automation.js   # 自动化环境检测模块
│   ├── incognito.js    # 无痕模式检测模块
│   ├── interceptor.js  # HTTP 请求头注入拦截器
│   └── index.js        # 统一入口
├── demo/
│   └── index.html      # 可视化演示页面
├── docs/
│   └── technical-doc.md  # 详细技术文档（中文）
└── package.json
```

---

## 演示

打开 `demo/index.html` 即可在浏览器中实时查看检测结果：

```bash
npx http-server . -p 8080 -o demo/index.html
```

---

## 详细文档

请参阅 [docs/technical-doc.md](docs/technical-doc.md)，内容包括：

- 检测原理与可信度评级
- 各浏览器适配说明
- 服务端接收与处理示例
- 安全说明与合规建议

---

## License

MIT
