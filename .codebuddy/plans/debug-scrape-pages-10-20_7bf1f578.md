---
name: debug-scrape-pages-10-20
overview: 创建诊断爬取程序，抓取 tid=45974302、authorid=150058 的第 10-20 页原始 DOM 结构并保存，供后续分析如何清洗内容。
todos:
  - id: create-debug-scraper
    content: 创建 src/debug-author-scrape.ts，实现诊断爬取逻辑（翻页、DOM提取、textContent vs innerHTML 对比、子元素统计）
    status: completed
  - id: add-debug-script
    content: "在 package.json 新增 \"debug:scrape\": \"tsx src/debug-author-scrape.ts\" 脚本命令"
    status: completed
    dependencies:
      - create-debug-scraper
---

## 用户需求

当前 `author-scraper.ts` 使用 `innerHTML` 从 `.postcontent.ubbcode` 提取内容，结果中包含了大量无效 HTML 标签（`div.quote` 引用块、`<a>` 链接、`<img>` 图片、`<span class="red/silver">` 样式标签、追踪像素图等）。

需要一个**诊断爬取工具**，对 `tid=45974302, authorid=150058` 的第 10-20 页进行采样抓取，保存每页的原始 DOM 结构信息，用于分析确定纯文本提取策略。

## 核心功能

- 抓取指定页面范围（10-20 页），对每页每个 postrow 提取诊断数据
- 记录 `.postcontent.ubbcode` 的 `textContent`（纯文本）与 `innerHTML`（含标签）对比
- 统计每个帖子内部子元素类型（br、span、img、a、div.quote、img.smile_ac、隐藏追踪图等）
- 输出到 `output/debug/` 目录，含完整诊断 JSON、每页摘要、纯文本版本、统计汇总
- 新增 `package.json` 脚本命令 `debug:scrape`

## 技术方案

### 实现策略

新建独立脚本 `src/debug-author-scrape.ts`，复用现有项目中 Playwright 的 browser 生命周期模式，直接内联所有逻辑（不依赖现有 scraper 类），保持完全独立。

### 架构设计

单文件脚本，流程如下：

```
CLI 解析参数 → 启动浏览器 → for 10..20 页:
  goto 每页 → waitForSelector → sleep → page.evaluate:
    - 提取 textContent / innerHTML
    - 统计子元素类型
  → 存入结果数组
→ 关闭浏览器
→ 写入 4 个输出文件到 output/debug/
```

### 输出文件

| 文件 | 说明 |
| --- | --- |
| `tid_{tid}_authorid_{authorid}_pages_{from}-{to}_{ts}.json` | 完整诊断数据（每页所有 post 的 textContent、innerHTML、childStats） |
| `page_{n}_summary_{ts}.json` | 每页摘要（textPreview、childStats） |
| `text_only_{ts}.json` | 纯 textContent 版本 |
| 控制台统计汇总 | HTML vs 纯文本大小压缩比、各类标签出现频次 |


### 统计指标

`childStats` 字段统计 `.postcontent.ubbcode` 内部：

- `brCount` / `spanCount` / `imgCount` / `aCount` / `divCount`
- `quoteBlockCount`: `div.quote` 引用块数量
- `smileImgCount`: `img.smile_ac` 表情图数量
- `hiddenImgCount`: `img[src="about:blank"]` 追踪像素数量
- `boldCount` / `delCount` / `collCount`

### 命令行用法

```
tsx src/debug-author-scrape.ts --tid 45974302 --authorid 150058 --from 10 --to 20
tsx src/debug-author-scrape.ts --from 10 --to 20 --no-headless --delay 3000
```