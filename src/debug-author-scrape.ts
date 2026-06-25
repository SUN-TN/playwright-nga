/**
 * NGA 帖子用户发言诊断爬取工具
 *
 * 用途：抓取指定页面范围，保存每页原始 DOM 结构，
 *        对比 textContent（纯文本）与 innerHTML（含标签），
 *        统计各类子元素（引用块、链接、图片、样式标签等），
 *        帮助确定纯文本提取策略。
 *
 * 用法:
 *   tsx src/debug-author-scrape.ts --tid 45974302 --authorid 150058 --from 10 --to 20
 */

import { chromium } from 'playwright';

const NGA_BASE = 'https://bbs.nga.cn';
const PAGE_SIZE = 20;

// ── 类型定义 ──────────────────────────────────────────────

interface ChildStats {
  brCount: number;
  spanCount: number;
  imgCount: number;
  aCount: number;
  divCount: number;
  bCount: number;
  delCount: number;
  collCount: number;
  quoteBlockCount: number;
  smileImgCount: number;
  hiddenImgCount: number;
  redSpanCount: number;
  silverSpanCount: number;
  otherSpanCount: number;
}

interface PostDebugInfo {
  floor: number;
  date: string;
  /** innerHTML：原始带标签内容 */
  innerHTML: string;
  /** textContent：纯文本内容 */
  textContent: string;
  /** 统计信息 */
  stats: ChildStats;
}

interface PageDebugInfo {
  page: number;
  url: string;
  posts: PostDebugInfo[];
}

interface DebugResult {
  tid: number;
  authorid: number;
  fromPage: number;
  toPage: number;
  pages: PageDebugInfo[];
  scrapedAt: string;
}

// ── 命令行参数解析 ───────────────────────────────────────

function printHelp(): void {
  console.log(`
NGA 帖子用户发言诊断爬取工具

用法:
  tsx src/debug-author-scrape.ts --tid <帖子ID> --authorid <用户ID> --from <起始页> --to <结束页> [选项]

选项:
  --tid <number>       帖子 ID (必填)
  --authorid <number>  用户 ID (必填)
  --from <number>      起始页 (必填)
  --to <number>        结束页 (必填)
  --delay <number>     翻页间隔毫秒数 (默认 2000)
  --no-headless        关闭无头模式，可视化浏览器操作
  --output <path>      输出目录 (默认 output/debug/)
  --help               显示此帮助

示例:
  tsx src/debug-author-scrape.ts --tid 45974302 --authorid 150058 --from 10 --to 20
  tsx src/debug-author-scrape.ts --from 10 --to 20 --no-headless --delay 3000`);
}

interface CliConfig {
  tid: number;
  authorid: number;
  fromPage: number;
  toPage: number;
  headless: boolean;
  pageDelay: number;
  outputDir: string;
}

function parseArgs(): CliConfig | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    return null;
  }

  const getValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const numArg = (flag: string, name: string): number | null => {
    const v = getValue(flag);
    if (!v) {
      console.error(`错误: 缺少 ${flag} 参数（${name}）`);
      return null;
    }
    const n = parseInt(v, 10);
    if (isNaN(n) || n <= 0) {
      console.error(`错误: ${flag} 必须是有效的正整数`);
      return null;
    }
    return n;
  };

  const tid = numArg('--tid', '帖子 ID');
  if (tid === null) return null;
  const authorid = numArg('--authorid', '用户 ID');
  if (authorid === null) return null;
  const fromPage = numArg('--from', '起始页');
  if (fromPage === null) return null;
  const toPage = numArg('--to', '结束页');
  if (toPage === null) return null;

  if (fromPage > toPage) {
    console.error('错误: --from 必须 <= --to');
    return null;
  }

  const headless = !args.includes('--no-headless');
  const delayStr = getValue('--delay');
  const pageDelay = delayStr ? parseInt(delayStr, 10) : 2000;
  const outputDir = getValue('--output') || 'output/debug';

  if (isNaN(pageDelay) || pageDelay < 500) {
    console.error('错误: --delay 必须 >= 500ms');
    return null;
  }

  return { tid, authorid, fromPage, toPage, headless, pageDelay, outputDir };
}

// ── 主逻辑 ───────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  if (!config) process.exit(1);

  const { tid, authorid, fromPage, toPage, headless, pageDelay, outputDir } = config;

  console.log(`\n诊断爬取: tid=${tid}, authorid=${authorid}, 第 ${fromPage}-${toPage} 页\n`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const allPages: PageDebugInfo[] = [];
  const allTextOnly: { floor: number; date: string; text: string }[] = [];

  // 汇总统计
  let totalHTMLSize = 0;
  let totalTextSize = 0;
  const summaryStats = new Map<string, number>();

  try {
    for (let p = fromPage; p <= toPage; p++) {
      const url = `${NGA_BASE}/read.php?tid=${tid}&authorid=${authorid}&page=${p}`;
      console.log(`正在爬取第 ${p} 页...`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('tr.postrow', { timeout: 15_000 });
      } catch (err) {
        console.error(`  第 ${p} 页加载失败:`, (err as Error).message);
        continue;
      }

      await sleep(1500);

      const result = await page.evaluate(() => {
        const posts: PostDebugInfo[] = [];

        const rows = document.querySelectorAll('tr.postrow');

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

          const innerHTML = contentEl.innerHTML.trim();
          const textContent = (contentEl.textContent || '').trim();

          // ── 子元素统计 ──
          const stats: ChildStats = {
            brCount: contentEl.querySelectorAll('br').length,
            spanCount: contentEl.querySelectorAll('span').length,
            imgCount: contentEl.querySelectorAll('img').length,
            aCount: contentEl.querySelectorAll('a').length,
            divCount: contentEl.querySelectorAll('div').length,
            bCount: contentEl.querySelectorAll('b').length,
            delCount: contentEl.querySelectorAll('del').length,
            collCount: contentEl.querySelectorAll('span.coll, del.coll').length,
            quoteBlockCount: contentEl.querySelectorAll('div.quote').length,
            smileImgCount: contentEl.querySelectorAll('img.smile_ac').length,
            hiddenImgCount: contentEl.querySelectorAll('img[src="about:blank"]').length,
            redSpanCount: contentEl.querySelectorAll('span.red').length,
            silverSpanCount: contentEl.querySelectorAll('span.silver').length,
            otherSpanCount: 0,
          };
          // otherSpanCount = 总 span - red - silver
          stats.otherSpanCount = stats.spanCount - stats.redSpanCount - stats.silverSpanCount;

          if (textContent) {
            posts.push({ floor, date, innerHTML, textContent, stats });
          }
        }

        // 收集 childrenStats 用来做汇总
        return posts;
      });

      if (result.length > 0) {
        allPages.push({ page: p, url, posts: result });

        // 纯文本收集 & 统计
        for (const post of result) {
          allTextOnly.push({ floor: post.floor, date: post.date, text: post.textContent });
          totalHTMLSize += post.innerHTML.length;
          totalTextSize += post.textContent.length;
        }

        console.log(`  → 第 ${p} 页 ${result.length} 条发言`);
      } else {
        console.log(`  → 第 ${p} 页无有效数据`);
      }

      // 翻页间隔
      if (p < toPage) {
        await sleep(pageDelay);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  // ── 写入文件 ──
  const fs = await import('fs/promises');
  await fs.mkdir(outputDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  // 1) 完整诊断 JSON
  const fullResult: DebugResult = {
    tid,
    authorid,
    fromPage,
    toPage,
    pages: allPages,
    scrapedAt: new Date().toISOString(),
  };
  const fullPath = `${outputDir}/debug_full_tid_${tid}_authorid_${authorid}_p${fromPage}-${toPage}_${ts}.json`;
  await fs.writeFile(fullPath, JSON.stringify(fullResult, null, 2), 'utf-8');
  console.log(`\n完整诊断数据: ${fullPath}`);

  // 2) 每页摘要 JSON
  const pageSummaries = allPages.map((pg) => ({
    page: pg.page,
    postCount: pg.posts.length,
    posts: pg.posts.map((p) => ({
      floor: p.floor,
      date: p.date,
      textPreview: p.textContent.slice(0, 200),
      htmlLen: p.innerHTML.length,
      textLen: p.textContent.length,
      stats: p.stats,
    })),
  }));
  const summaryPath = `${outputDir}/debug_summary_${ts}.json`;
  await fs.writeFile(summaryPath, JSON.stringify(pageSummaries, null, 2), 'utf-8');
  console.log(`每页摘要数据: ${summaryPath}`);

  // 3) 纯文本版本
  const textPath = `${outputDir}/debug_textonly_tid_${tid}_authorid_${authorid}_p${fromPage}-${toPage}_${ts}.json`;
  await fs.writeFile(textPath, JSON.stringify(allTextOnly, null, 2), 'utf-8');
  console.log(`纯文本数据: ${textPath}`);

  // ── 控制台统计汇总 ──
  const totalPosts = allTextOnly.length;
  const compressionRatio = totalHTMLSize > 0 ? ((1 - totalTextSize / totalHTMLSize) * 100).toFixed(1) : '0';

  console.log(`\n========== 诊断统计 ==========`);
  console.log(`页码范围:      第 ${fromPage} - ${toPage} 页`);
  console.log(`有效页面:      ${allPages.length} 页`);
  console.log(`发言总数:      ${totalPosts}`);
  console.log(`HTML 总大小:   ${totalHTMLSize.toLocaleString()} 字符`);
  console.log(`纯文本总大小:  ${totalTextSize.toLocaleString()} 字符`);
  console.log(`压缩比:        ${compressionRatio}%`);

  // 汇总所有统计
  const aggStats: Record<string, number> = {};
  for (const pg of allPages) {
    for (const post of pg.posts) {
      for (const [key, val] of Object.entries(post.stats)) {
        aggStats[key] = (aggStats[key] || 0) + val;
      }
    }
  }

  console.log(`\n子元素统计 (${totalPosts} 条发言合计):`);
  const statLabels: Record<string, string> = {
    brCount: '<br> 换行',
    spanCount: '<span> 总数',
    redSpanCount: '<span class="red"> 红色高亮',
    silverSpanCount: '<span class="silver"> 灰色签名',
    otherSpanCount: '其他 <span>',
    imgCount: '<img> 总数',
    hiddenImgCount: '<img> 追踪像素 (about:blank)',
    smileImgCount: '<img.smile_ac> 表情',
    aCount: '<a> 链接',
    divCount: '<div> 总数',
    quoteBlockCount: '<div.quote> 引用块',
    bCount: '<b> 加粗',
    delCount: '<del> 删除线',
    collCount: '.coll 折叠/打码',
  };

  for (const [key, label] of Object.entries(statLabels)) {
    const count = aggStats[key] || 0;
    if (count > 0 || key === 'otherSpanCount') {
      console.log(`  ${String(count).padStart(5)}  ${label}`);
    }
  }

  console.log(`\n所有文件已保存到: ${outputDir}/`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main();
