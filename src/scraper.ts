import { Browser, BrowserContext, chromium, Page } from 'playwright';
import { ScrapeConfig, UserInfo } from './types.js';

const NGA_BASE = 'https://bbs.nga.cn';
const PAGE_SIZE = 20; // NGA 每页 20 楼

export class NgaScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: Required<ScrapeConfig>;

  constructor(config: ScrapeConfig) {
    this.config = {
      tid: config.tid,
      headless: config.headless ?? true,
      pageDelay: config.pageDelay ?? 2000,
      maxPages: config.maxPages ?? 999,
      outputFile: config.outputFile ?? '',
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

  /** 遍历所有页面并返回去重后的用户列表 */
  async getAllPages(): Promise<{ pages: UserInfo[][]; totalPages: number }> {
    if (!this.page) throw new Error('浏览器未初始化');

    const allPages: UserInfo[][] = [];
    let pageNum = 1;

    while (pageNum <= this.config.maxPages) {
      console.log(`正在爬取第 ${pageNum} 页...`);
      const users = await this.scrapePage(pageNum);

      if (users.length === 0) {
        console.log(`第 ${pageNum} 页无有效数据，爬取结束。`);
        break;
      }

      allPages.push(users);
      console.log(`  → 获取到 ${users.length} 位用户`);

      // 如果当前页用户数 < PAGE_SIZE，说明已是末页
      if (users.length < PAGE_SIZE) {
        console.log('已到达最后一页。');
        pageNum++;
        break;
      }

      pageNum++;

      // 翻页间隔，避免请求过快
      if (pageNum <= this.config.maxPages) {
        await this.sleep(this.config.pageDelay);
      }
    }

    return { pages: allPages, totalPages: pageNum - 1 };
  }

  /** 爬取单页用户列表（纯 DOM 提取） */
  async scrapePage(page: number): Promise<UserInfo[]> {
    if (!this.page) throw new Error('浏览器未初始化');

    const url = `${NGA_BASE}/read.php?tid=${this.config.tid}&page=${page}`;

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      // 等待帖子内容中的用户链接出现
      await this.page.waitForSelector('a.userlink.author[href*="uid="]', {
        timeout: 15_000,
      });
    } catch (err) {
      console.error(`  第 ${page} 页加载失败:`, (err as Error).message);
      return [];
    }
    await this.sleep(2000);


    return this.extractUsersFromDOM();
  }

  /**
   * 从页面 DOM 中精确提取用户信息
   *
   * 基于用户提供的 dom.html 精确 DOM 结构：
   *
   * <div style="text-align:left;line-height:1.5em">
   *   <span class="right"><a name="l40" href="...">#40</a></span>
   *   <a href="nuke.php?func=ucp&amp;uid=60980996"
   *      class="userlink author b nobr"
   *      onclick="commonui.posterInfo.userClick(event,&quot;60980996&quot;)">
   *     <b class="block_txt">z</b>
   *     heshiasd
   *   </a>
   *   <a name="uid" class="small_colored_text_btn stxt ...">60980996</a>
   * </div>
   *
   * 提取规则：
   * - 用户名：遍历 a.userlink.author 的 childNodes，跳过 <b> 子元素，只取纯文本节点
   *   （例如 <b>z</b>heshiasd  → 用户名为 "heshiasd"）
   * - UID：优先取同楼层 a[name="uid"] 的文本内容，回退从 href 中正则提取
   */
  private async extractUsersFromDOM(): Promise<UserInfo[]> {
    if (!this.page) return [];

    try {
      const users = await this.page.evaluate(() => {
        const result: { uid: number; username: string }[] = [];
        const seen = new Set<number>();

        const authorLinks = document.querySelectorAll<HTMLAnchorElement>(
          'a.userlink.author[href*="uid="]',
        );

        for (const link of authorLinks) {
          // ── 提取 UID ──
          let uid: number | null = null;

          // 优先从同楼层的 a[name="uid"] 取文本
          const uidAnchor = link.parentElement?.querySelector<HTMLElement>(
            'a[name="uid"]',
          );
          if (uidAnchor) {
            const parsed = parseInt(uidAnchor.textContent?.trim() ?? '', 10);
            if (!isNaN(parsed) && parsed > 0) uid = parsed;
          }

          // 回退：从 href 中正则提取 uid=XXXXX
          if (uid === null) {
            const hrefMatch = link.href.match(/[?&]uid=(\d+)/);
            if (hrefMatch) {
              const parsed = parseInt(hrefMatch[1], 10);
              if (!isNaN(parsed) && parsed > 0) uid = parsed;
            }
          }

          if (uid === null || seen.has(uid)) continue;

          
          // ── 提取用户名 ──
          // 遍历 childNodes，跳过 <b> 元素，只取纯文本节点
          // DOM: <a><b>z</b>heshiasd</a> → 用户名: "heshiasd"
          let username = '';
          for (const node of link.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              username += (node as Text).wholeText;
            }
          }
          username = username.trim();
          if (!username) continue;

          // 二次校验：确保 username 不是纯数字（防止提取到 UID）
          if (/^\d+$/.test(username)) continue;

          seen.add(uid);
          result.push({ uid, username });
        }

        return result;
      });

      return users;
    } catch (err) {
      console.error('  DOM 提取失败:', (err as Error).message);
      return [];
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
