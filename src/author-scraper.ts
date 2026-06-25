import { Browser, BrowserContext, chromium, Page } from 'playwright';

const NGA_BASE = 'https://bbs.nga.cn';
const PAGE_SIZE = 15; // NGA 每页 20 楼

/** 提问信息（仅 reply 类型有） */
export interface QuoteInfo {
  user: string;
  date: string;
  text: string;
}

/** 单条发言/回答 */
export interface AuthorPost {
  floor: number;
  date: string;
  /** reply：引用回复（含问答上下文）| statement：纯发言（无引用） */
  type: 'reply' | 'statement';
  /** 作者自己的文本内容（纯文本） */
  content: string;
  /** 回复类型时的提问信息 */
  quote?: QuoteInfo;
}

/** 爬取配置 */
export interface AuthorScrapeConfig {
  tid: number;
  authorid: number;
  headless?: boolean;
  pageDelay?: number;
  maxPages?: number;
  outputFile?: string;
}

/** 爬取结果 */
export interface AuthorScrapeResult {
  tid: number;
  authorid: number;
  posts: AuthorPost[];
  totalPages: number;
  totalPosts: number;
  scrapedAt: string;
}

export class AuthorScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: Required<Omit<AuthorScrapeConfig, 'outputFile'>> & { outputFile?: string };

  constructor(config: AuthorScrapeConfig) {
    this.config = {
      tid: config.tid,
      authorid: config.authorid,
      headless: config.headless ?? true,
      pageDelay: config.pageDelay ?? 2000,
      maxPages: config.maxPages ?? 999,
      outputFile: config.outputFile,
    };
  }

  /** 启动浏览器 */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30_000);
  }

  /** 遍历所有页面并返回发言列表 */
  async getAllPosts(): Promise<{ posts: AuthorPost[]; totalPages: number }> {
    if (!this.page) throw new Error('浏览器未初始化');

    const allPosts: AuthorPost[] = [];
    let pageNum = 1;

    while (pageNum <= this.config.maxPages) {
      console.log(`正在爬取第 ${pageNum} 页...`);
      const result = await this.scrapePage(pageNum);

      if (result.posts.length === 0) {
        console.log(`第 ${pageNum} 页无有效数据，爬取结束。`);
        break;
      }

      allPosts.push(...result.posts);
      const replyCount = result.posts.filter((p) => p.type === 'reply').length;
      const stmtCount = result.posts.filter((p) => p.type === 'statement').length;
      console.log(`  → 获取到 ${result.posts.length} 条 (问答 ${replyCount} / 发言 ${stmtCount})`);

      if (result.rowCount < PAGE_SIZE) {
        console.log('已到达最后一页。');
        pageNum++;
        break;
      }

      pageNum++;

      if (pageNum <= this.config.maxPages) {
        await this.sleep(this.config.pageDelay);
      }
    }

    return { posts: allPosts, totalPages: pageNum - 1 };
  }

  /** 爬取单页发言 */
  private async scrapePage(page: number): Promise<{ posts: AuthorPost[]; rowCount: number }> {
    if (!this.page) throw new Error('浏览器未初始化');

    const url = `${NGA_BASE}/read.php?tid=${this.config.tid}&authorid=${this.config.authorid}&page=${page}`;

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page.waitForSelector('tr.postrow', {
        timeout: 15_000,
      });
    } catch (err) {
      console.error(`  第 ${page} 页加载失败:`, (err as Error).message);
      return { posts: [], rowCount: 0 };
    }

    await this.sleep(1500);

    return this.extractPostsFromDOM();
  }

  /**
   * 从页面 DOM 中提取并清洗发言内容
   *
   * 清洗流水线（在浏览器端完成）：
   *   1. 移除追踪像素 img[src="about:blank"]
   *   2. 移除内容图片 img[data-srcorg]
   *   3. 表情 img.smile_ac → 转为 [alt] 文本
   *   4. 解析 div.quote → 提取提问者/时间/内容
   *   5. 移除 NGA 签名 ……poi~
   *   6. span.red / span.silver 保留文本去标签
   *   7. br → \n
   *   8. 去除所有残留 HTML 标签得到纯文本
   *   9. 按有无 quote 分类为 reply / statement
   */
  private async extractPostsFromDOM(): Promise<{ posts: AuthorPost[]; rowCount: number }> {
    if (!this.page) return { posts: [], rowCount: 0 };

    try {
      const result = await this.page.evaluate(() => {
        interface QuoteInfo {
          user: string;
          date: string;
          text: string;
        }
        interface AuthorPost {
          floor: number;
          date: string;
          type: 'reply' | 'statement';
          content: string;
          quote?: QuoteInfo;
        }

        const posts: AuthorPost[] = [];
        const rows = document.querySelectorAll('tr.postrow');
        const rowCount = rows.length;

        for (const row of rows) {
          // ── 楼层号 ──
          let floor = 0;
          const floorLink = row.querySelector<HTMLAnchorElement>('a[name^="l"]');
          if (floorLink) {
            const m = (floorLink.getAttribute('name') || '').match(/^l(\d+)$/);
            if (m) floor = parseInt(m[1], 10);
          }
          if (floor === 0) {
            const rightA = row.querySelector<HTMLElement>('span.right a');
            if (rightA) {
              const m = (rightA.textContent || '').trim().match(/^#(\d+)$/);
              if (m) floor = parseInt(m[1], 10);
            }
          }

          // ── 日期 ──
          let date = '';
          const dateEl = row.querySelector<HTMLElement>('span.postinfot.postdatec.stxt');
          if (dateEl) date = (dateEl.textContent || '').trim();

          // ── 内容容器 ──
          const contentEl = row.querySelector<HTMLElement>('span.postcontent.ubbcode');
          if (!contentEl) continue;

          const rawHTML = contentEl.innerHTML.trim();
          if (!rawHTML) continue;

          // ══════ 清洗流水线 ══════

          // 步骤 0: 用临时 div 承载 HTML，方便 DOM 操作
          const div = document.createElement('div');
          div.innerHTML = rawHTML;

          // 1) 移除追踪像素（NGA 内部计数用）
          div.querySelectorAll('img[src="about:blank"]').forEach((el) => el.remove());

          // 2) 移除内容图片（嵌入的截图/图片，有 data-srcorg 属性）
          div.querySelectorAll('img[data-srcorg]').forEach((el) => el.remove());

          // 3) 转换表情图为 alt 文本
          div.querySelectorAll('img.smile_ac').forEach((el) => {
            const alt = el.getAttribute('alt') || '';
            if (alt) {
              const textNode = document.createTextNode(`[${alt}]`);
              el.parentNode?.replaceChild(textNode, el);
            } else {
              el.remove();
            }
          });

          // 4) 解析并移除 div.quote（引用块）
          let quote: QuoteInfo | undefined;
          const quoteEl = div.querySelector('div.quote');
          if (quoteEl) {
            const quoteText = (quoteEl.textContent || '').trim();
            // 格式: "+R by  [username] (YYYY-MM-DD HH:MM) question text..."
            const quoteMatch = quoteText.match(
              /^\+R by\s+\[(.+?)\]\s+\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)\s*([\s\S]*)/,
            );
            if (quoteMatch) {
              quote = {
                user: quoteMatch[1].trim(),
                date: quoteMatch[2].trim(),
                text: quoteMatch[3].trim(),
              };
            }
            quoteEl.remove();
          }

          // 5) 移除 NGA 签名 ——最后一次出现的 ……poi~（通常在 span.silver 内）
          // 策略：找最后一个含 ……poi~ 的 span.silver，删除它
          const silverSpans = div.querySelectorAll('span.silver');
          let poiRemoved = false;
          // 从后往前找
          for (let i = silverSpans.length - 1; i >= 0; i--) {
            const span = silverSpans[i];
            if ((span.textContent || '').includes('……poi~')) {
              span.remove();
              poiRemoved = true;
              break;
            }
          }
          // 如果最后没有 span.silver 包裹的签名，直接在纯文本末尾移除
          if (!poiRemoved) {
            const allText = div.textContent || '';
            const poiIdx = allText.lastIndexOf('……poi~');
            if (poiIdx !== -1) {
              // 简短方式：替换掉最后的 ……poi~
              const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
              const textNodes: Text[] = [];
              let node: Text | null;
              while ((node = walker.nextNode() as Text | null)) {
                textNodes.push(node);
              }
              // 从后往前找包含 ……poi~ 的文本节点
              for (let i = textNodes.length - 1; i >= 0; i--) {
                const tn = textNodes[i];
                const idx = tn.textContent?.lastIndexOf('……poi~') ?? -1;
                if (idx !== -1) {
                  tn.textContent = (tn.textContent || '').substring(0, idx).trimEnd();
                  break;
                }
              }
            }
          }

          // 6) span.red 保留文本去标签
          div.querySelectorAll('span.red').forEach((el) => {
            const txt = el.textContent || '';
            if (txt.trim()) {
              const textNode = document.createTextNode(txt);
              el.parentNode?.replaceChild(textNode, el);
            } else {
              el.remove();
            }
          });

          // 7) 其他 span（silver 残留等）、b、a 保留文本去标签
          div.querySelectorAll('span, b, a, del, strong, em, u, i, font').forEach((el) => {
            const txt = el.textContent || '';
            if (txt.trim()) {
              const textNode = document.createTextNode(txt);
              el.parentNode?.replaceChild(textNode, el);
            } else {
              el.remove();
            }
          });

          // 8) br → \n
          div.querySelectorAll('br').forEach((el) => {
            el.parentNode?.replaceChild(document.createTextNode('\n'), el);
          });

          // 9) 获取纯净文本
          let content = (div.textContent || '').trim();

          // 10) 压缩多余空白：多个连续换行 → 最多2个换行，首尾去空白
          content = content.replace(/\n{3,}/g, '\n\n');
          // 压缩行内多余空格
          content = content.replace(/ {2,}/g, ' ');
          content = content.trim();

          if (!content) continue;

          // 11) 判定类型
          const type = quote ? 'reply' : 'statement';

          const post: AuthorPost = { floor, date, type, content };
          if (quote) post.quote = quote;

          posts.push(post);
        }

        return { posts, rowCount };
      });

      return result;
    } catch (err) {
      console.error('  DOM 提取失败:', (err as Error).message);
      return { posts: [], rowCount: 0 };
    }
  }

  /** 关闭浏览器 */
  async destroy(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
