---
name: fix-dom-extraction
overview: 根据用户提供的精确 DOM 结构，优化 scraper 的 DOM 提取逻辑，精确提取用户名和 UID
todos:
  - id: rewrite-dom-extraction
    content: 重写 src/scraper.ts 中 tryDomExtraction 方法的 DOM 提取逻辑，基于 `a.userlink.author` 定位，精确提取 UID（从 `a[name="uid"]`）和用户名（textContent 去除 `
    status: completed
---

根据用户提供的 NGA 帖子页面精确 DOM 结构，重写 src/scraper.ts 中 `tryDomExtraction` 方法的 DOM 提取逻辑，实现精确提取每个楼层中的用户 UID 和用户名。

## DOM 结构分析

```html
<div style="text-align:left;line-height:1.5em">
  <a href="nuke.php?func=ucp&amp;uid=60980996" id="postauthor40"
     class="userlink author b nobr"
     onclick="commonui.posterInfo.userClick(event,&quot;60980996&quot;)">
    <b class="block_txt" name="nameinit" style="...">z</b>
    heshiasd
  </a>
  <a href="javascript:void(0)" name="uid" class="small_colored_text_btn stxt">60980996</a>
</div>
```

## 提取规则

1. **UID**：从 `a[name="uid"]` 元素的 textContent 获取纯数字 UID；同时可从 `a.userlink.author[href*="uid="]` 的 href 属性中正则匹配 `uid=(\d+)` 作为备用
2. **用户名**：从 `a.userlink.author` 元素中取 textContent 后，**减去** `<b>` 子元素的 textContent（`<b>` 是单字前缀背景色块），剩余纯文本即为用户名（如 "heshiasd"）
3. **定位方式**：直接选取 `a.userlink.author[id^="postauthor"]` 作为每个楼层的锚点，无需依赖外层容器

## 核心功能

- 精确 DOM 提取 UID 和用户名，消除当前 `link.textContent` 误包含 `<b>` 前缀字符的问题
- 保留 API 优先提取逻辑不变

## 技术方案

### 修改范围

仅修改 `src/scraper.ts` 中的 `tryDomExtraction` 方法（第 168-236 行），其余代码不变。

### 具体策略

#### 1. 定位方式变更

将容器选择策略从 `[id^="post"]` 改为直接选取 `a.userlink.author[id^="postauthor"]`。每个楼层有一个唯一的 `#postauthorXX`，格式稳定，不会误匹配。

#### 2. UID 提取（双保险）

- 主方案：取当前元素的相邻/同容器内的 `a[name="uid"]` 的 textContent
- 备用方案：从当前 `a.userlink.author` 的 href 中正则 `uid=(\d+)`

#### 3. 用户名提取（精确）

- 用 `childNodes` 遍历法：取 `a.userlink.author` 下的所有子节点，跳过 `<b>` 元素，只取 `nodeType === Node.TEXT_NODE` 的文本内容并 trim
- 或者用 `firstChild?.textContent` 取 `<b>` 后的文本（从 DOM 结构看，`<b>` 是第一个子元素，其后是文本节点）

#### 4. 代码结构

```typescript
private async tryDomExtraction(): Promise<UserInfo[]> {
  // 1. 选取所有 a.userlink.author[id^="postauthor"]
  // 2. 遍历每个元素：
  //    a. UID: 从同容器内的 a[name="uid"] textContent 或 href 正则获取
  //    b. 用户名: 取 a.userlink.author 文本减去 b 元素的文本
  // 3. 去重后返回
}
```

### 性能考虑

- 使用 `querySelectorAll` 一次选取，避免多次 DOM 查询
- 使用 `Set` 去重
- 时间复杂度 O(n)，n 为页面楼层数