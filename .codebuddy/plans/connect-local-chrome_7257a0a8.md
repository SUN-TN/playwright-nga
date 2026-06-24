---
name: connect-local-chrome
overview: 在项目中添加通过 CDP 连接宿主机 Chrome 浏览器的能力，直接复用已有 cookies 访问 NGA
todos:
  - id: config-cdpPort
    content: 在 ScrapeConfig 接口中添加 cdpPort 字段 (types.ts)
    status: completed
  - id: scraper-cdp
    content: 修改 scraper.ts：constructor 存储 cdpPort，initialize 增加 CDP 连接分支，destroy 适配不关宿主机浏览器
    status: completed
    dependencies:
      - config-cdpPort
  - id: cli-connect-existing
    content: 修改 index.ts：parseArgs 增加 --connect-existing 参数解析与校验，printHelp 增加说明
    status: completed
    dependencies:
      - config-cdpPort
  - id: start-chrome-script
    content: 新建 start-chrome.sh 辅助启动脚本
    status: completed
---

## 用户需求

爬虫在访问 NGA 帖子时，需要直接使用宿主机 Chrome 浏览器中已有的 cookie（已登录 NGA 的会话），从而无需在 Playwright 中单独管理登录态。

## 核心功能

1. 支持通过 `--connect-existing <端口>` CLI 参数，连接宿主机已运行的 Chrome 实例
2. 连接后自动复用该浏览器的默认上下文（含所有已有 cookie，如 NGA 登录态）
3. 提供 `start-chrome.sh` 辅助脚本，一键启动带调试端口的 Chrome
4. 不指定参数时保持原有 `chromium.launch()` 行为，完全向后兼容

## 技术方案

### 核心方案：Chrome DevTools Protocol (CDP)

Playwright 提供 `chromium.connectOverCDP()` 方法，可以通过 CDP 端口连接到已在运行的 Chrome 实例。连接后通过 `browser.contexts()[0]` 获取浏览器的默认上下文（包含所有 cookie 和登录态），再基于该上下文创建新页面进行操作。CDP 端口仅绑定 127.0.0.1，不暴露到外网。

### 修改范围

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `src/types.ts` | 修改 | ScrapeConfig 新增 cdpPort 字段 |
| `src/scraper.ts` | 修改 | initialize/destroy 增加 CDP 连接分支 |
| `src/index.ts` | 修改 | parseArgs 增加 --connect-existing 参数 |
| `start-chrome.sh` | 新建 | 一键启动带调试端口的 Chrome |


### 详细设计

#### 1. src/types.ts

```typescript
export interface ScrapeConfig {
  tid: number;
  headless?: boolean;
  pageDelay?: number;
  maxPages?: number;
  outputFile?: string;
  /** CDP 端口，连接已有 Chrome（如 9222）。设置后 headless 无意义 */
  cdpPort?: number;
}
```

#### 2. src/scraper.ts

**constructor** — 将 `cdpPort` 纳入 `this.config`：

```typescript
this.config = {
  tid: config.tid,
  headless: config.headless ?? true,
  pageDelay: config.pageDelay ?? 2000,
  maxPages: config.maxPages ?? 999,
  outputFile: config.outputFile ?? '',
  cdpPort: config.cdpPort,
};
```

**initialize()** — 根据 `cdpPort` 分叉：

```
if (this.config.cdpPort) {
  // CDP 模式：连接宿主机 Chrome
  wsEndpoint = http://127.0.0.1:${cdpPort}
  browser = await chromium.connectOverCDP(wsEndpoint)
  // 取默认上下文（含 cookies），若无则新建
  context = browser.contexts()[0] ?? await browser.newContext()
} else {
  // 原有模式：launch 新浏览器
  browser = await chromium.launch({ headless })
  context = await browser.newContext({ viewport, userAgent })
}
page = await context.newPage()
```

**destroy()** — CDP 模式下不关闭宿主机浏览器：

```
// 始终关闭 page 和 context
if (cdpPort) {
  // CDP 模式：只关闭 page + context，不关 browser
  close page; close context;
} else {
  // 普通模式：关闭全部（含 browser）
  close page; close context; close browser;
}
```

#### 3. src/index.ts

在 `parseArgs()` 中新增 `--connect-existing <port>` 的解析，校验端口范围 `1024-65535`，同 `--tid` 一样做有效性检查。在 `printHelp()` 中增加对应说明。

#### 4. start-chrome.sh

```
#!/usr/bin/env bash
set -euo pipefail
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${1:-9222}"
echo "启动 Chrome（调试端口 :${PORT}）..."
"$CHROME" --remote-debugging-port="$PORT" &>/dev/null &
```

赋予执行权限：`chmod +x start-chrome.sh`

### 向后兼容性

- 不指定 `--connect-existing` 时行为完全不变
- `Required<ScrapeConfig>` 中 `cdpPort` 为 `number | undefined`（因为 config 中赋值可能为 undefined），不影响原有流程
- destroy 中通过判断 `this.config.cdpPort` 区分模式，不会误关宿主机浏览器

### 用户体验流程

```
1. 用户先运行 ./start-chrome.sh（或手动启动带 --remote-debugging-port=9222 的 Chrome）
2. 用户在 Chrome 中登录 NGA，cookie 持久化保存在默认上下文中
3. 用户运行：tsx src/index.ts --tid 12345 --connect-existing 9222
4. 爬虫连接到宿主机 Chrome，自动携带 NGA cookie 访问帖子
```