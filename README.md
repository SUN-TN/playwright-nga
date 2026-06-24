# Playwright NGA 帖子用户爬虫

使用 Playwright + TypeScript 爬取 NGA 论坛帖子中所有发言用户的 **UID** 和 **昵称**，支持自动翻页遍历全部楼层，跨页去重。

## 安装

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器（首次使用需要）
npx playwright install chromium
```

## 使用

```bash
# 基础用法：爬取帖子所有页的用户
npx tsx src/index.ts --tid 45974302

# 导出结果为 JSON 文件
npx tsx src/index.ts --tid 45974302 --output ./output/result.json

# 可视化模式（查看浏览器操作过程）
npx tsx src/index.ts --tid 45974302 --no-headless

# 自定义翻页间隔（毫秒）
npx tsx src/index.ts --tid 45974302 --delay 3000

# 限制最大爬取页数
npx tsx src/index.ts --tid 45974302 --max-pages 5
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--tid` | 必填 | NGA 帖子 ID（从 URL 中获取，如 `tid=45974302`） |
| `--headless` | `true` | 是否无头模式（不显示浏览器窗口） |
| `--no-headless` | — | 关闭无头模式，可视化浏览器操作 |
| `--delay` | `2000` | 翻页间隔毫秒数 |
| `--max-pages` | `999` | 最大爬取页数 |
| `--output` | — | 结果输出到 JSON 文件路径 |
| `--help` | — | 显示帮助信息 |

## 输出示例

```
开始爬取 NGA 帖子 tid=45974302...

正在爬取第 1 页...
  → 获取到 20 位用户
正在爬取第 2 页...
  → 获取到 20 位用户
...

========== 爬取完成 ==========
帖子 ID:    45974302
爬取页数:   10 页
总楼层数:   200
去重用户数: 89

共找到 89 位发言用户：

UID        用户名
────────────────────────────────────────────
123456     用户A
234567     用户B
...
```

## 工作原理

1. Playwright 启动 Chromium 浏览器，模拟真实用户访问
2. 页面加载后，优先通过 `page.evaluate()` 调用 NGA 同源 JSON API (`__output=11`) 获取结构化用户数据
3. 若 API 方式失败，自动回退到 DOM 元素提取
4. 自动翻页遍历到最后一页
5. 按 UID 去重合并后输出

## 输出 JSON 结构

```json
{
  "tid": 45974302,
  "totalPages": 10,
  "totalPosts": 200,
  "users": [
    { "uid": 123456, "username": "用户A" },
    { "uid": 234567, "username": "用户B" }
  ],
  "scrapedAt": "2026-06-24T08:00:00.000Z"
}
```
