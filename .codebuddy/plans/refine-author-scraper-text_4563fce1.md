---
name: refine-author-scraper-text
overview: 修改 author-scraper.ts 的 DOM 提取逻辑，从 innerHTML 做智能清洗：区分发言/回答类型、分离问答上下文、去除无效标签、保留纯文本。输出结构化 JSON（含 type、question、content）。
todos:
  - id: refine-author-scraper
    content: 修改 src/author-scraper.ts：更新 AuthorPost 类型定义（新增 type/quote），重写 extractPostsFromDOM 的 page.evaluate 清洗流水线
    status: completed
  - id: update-author-cli
    content: 修改 src/author-index.ts：适配新 AuthorPost 类型，控制台输出增加 reply/statement 分类统计
    status: completed
    dependencies:
      - refine-author-scraper
---

## 用户需求

修改现有 author-scraper.ts 的 DOM 提取逻辑，将原始 HTML 转换为结构化纯文本数据，区分「发言」和「问答」两种类型，清晰组织输出结构。

## 核心功能

- **纯文本提取**：移除所有 HTML 标签、链接、图片（含追踪像素、表情图、内容图），只保留纯文本
- **类型区分**：`type: "reply"`（引用回复，含问答上下文）vs `type: "statement"`（纯发言，无引用）
- **问答上下文保留**：reply 类型解析 `div.quote` 中的提问者用户名、提问时间、提问内容
- **表情转换**：`img.smile_ac` 按 alt 属性转为 `[哭笑]` `[呆]` `[吻]` 等文本形式
- **颜色文本保留**：`span.red` 保留内部文本内容，仅去除标签
- **签名移除**：`span.silver` 包裹的 `……poi~` 尾部签名移除

## 技术方案

### 实现策略

不新建文件，直接修改 `src/author-scraper.ts` 和 `src/author-index.ts`。核心改动在 `page.evaluate` 内的 DOM 清洗逻辑，所有处理在浏览器端完成，避免 Node 端二次处理。

### 数据结构变更

```typescript
// 提问信息（仅 reply 类型有）
interface QuoteInfo {
  user: string;
  date: string;
  text: string;
}

// 单条发言/回答
interface AuthorPost {
  floor: number;
  date: string;
  type: 'reply' | 'statement';
  content: string;
  quote?: QuoteInfo;
}
```

### 清洗流水线（在 page.evaluate 内执行）

```
.postcontent.ubbcode innerHTML
    │
    ├─ 1. 移除追踪像素：img[src="about:blank"]（onerror 为 ubbcode.copyChk 的那个）
    │
    ├─ 2. 移除内容图片：img[data-argi][data-srcorg]（懒加载的嵌入图片）
    │
    ├─ 3. 转换表情图：img.smile_ac → [alt文本]
    │
    ├─ 4. 移除 NGA 签名：最后一个含 ……poi~ 的 span.silver
    │
    ├─ 5. 保留色文本：span.red 保留 textContent，去标签
    │
    ├─ 6. br → \n
    │
    ├─ 7. 解析 div.quote → 提取 user/date/question textContent
    │
    ├─ 8. 判断 type：有 quote → "reply"，无 → "statement"
    │
    └─ 9. 对最终文本：去除所有残留 HTML 标签，得到纯文本
```

### div.quote 解析规则

quote 的 textContent 格式为：`+R by  [username] (YYYY-MM-DD HH:MM) question text`

正则模式：`/^\+R by\s+\[(.+?)\]\s+\((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\)\s*(.*)/s`

### 修改文件清单

| 文件 | 改动 |
| --- | --- |
| `src/author-scraper.ts` | 修改 `AuthorPost` 接口（新增 type/quote 字段）、重写 `extractPostsFromDOM` 中的 `page.evaluate` 清洗逻辑 |
| `src/author-index.ts` | 适配新 `AuthorPost` 类型，控制台增加 reply/statement 数量统计 |