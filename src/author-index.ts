import { AuthorScraper, AuthorScrapeConfig, AuthorScrapeResult } from './author-scraper.js';

function printHelp(): void {
  console.log(`
NGA 帖子指定用户发言爬虫工具

用法:
  tsx src/author-index.ts --tid <帖子ID> --authorid <用户ID> [选项]

选项:
  --tid <number>           帖子 ID (必填，如 45974302)
  --authorid <number>      用户 ID (必填，如 150058)
  --headless <boolean>     是否无头模式 (默认 true)
  --delay <number>         翻页间隔毫秒数 (默认 2000)
  --max-pages <number>     最大爬取页数 (默认 999)
  --output <path>          输出 JSON 文件路径（默认自动生成到 output/ 目录）
  --no-headless            关闭无头模式，可视化浏览器操作
  --help                   显示此帮助

示例:
  tsx src/author-index.ts --tid 45974302 --authorid 150058
  tsx src/author-index.ts --tid 45974302 --authorid 150058 --output ./output/author-posts.json
  tsx src/author-index.ts --tid 45974302 --authorid 150058 --no-headless --delay 3000`);
}

function parseArgs(): AuthorScrapeConfig | null {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    return null;
  }

  const getValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const tidStr = getValue('--tid');
  if (!tidStr) {
    console.error('错误: 请提供 --tid 参数（帖子 ID）');
    printHelp();
    return null;
  }

  const tid = parseInt(tidStr, 10);
  if (isNaN(tid) || tid <= 0) {
    console.error('错误: --tid 必须是有效的正整数');
    return null;
  }

  const authoridStr = getValue('--authorid');
  if (!authoridStr) {
    console.error('错误: 请提供 --authorid 参数（用户 ID）');
    printHelp();
    return null;
  }

  const authorid = parseInt(authoridStr, 10);
  if (isNaN(authorid) || authorid <= 0) {
    console.error('错误: --authorid 必须是有效的正整数');
    return null;
  }

  const headless = args.includes('--no-headless') ? false : true;
  const delayStr = getValue('--delay');
  const delay = delayStr ? parseInt(delayStr, 10) : 2000;
  const maxPagesStr = getValue('--max-pages');
  const maxPages = maxPagesStr ? parseInt(maxPagesStr, 10) : 999;
  const outputFile = getValue('--output') || undefined;

  if (isNaN(delay) || delay < 500) {
    console.error('错误: --delay 必须 >= 500ms');
    return null;
  }

  return { tid, authorid, headless, pageDelay: delay, maxPages, outputFile };
}

/** 生成默认输出文件路径：output/author_tid_{tid}_authorid_{authorid}_{YYYY-MM-DD_HH-mm-ss}.json */
function defaultOutputPath(tid: number, authorid: number): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `output/author_tid_${tid}_authorid_${authorid}_${ts}.json`;
}

async function saveResult(result: AuthorScrapeResult, filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`结果已保存到: ${filePath}`);
}

async function main(): Promise<void> {
  const config = parseArgs();
  if (!config) {
    process.exit(1);
  }

  const scraper = new AuthorScraper(config);

  try {
    await scraper.initialize();

    console.log(`\n开始爬取 NGA 帖子 tid=${config.tid} 用户 authorid=${config.authorid} 的发言...\n`);

    const { posts, totalPages } = await scraper.getAllPosts();

    const result: AuthorScrapeResult = {
      tid: config.tid,
      authorid: config.authorid,
      posts,
      totalPages,
      totalPosts: posts.length,
      scrapedAt: new Date().toISOString(),
    };

    // 控制台输出
    const replyCount = posts.filter((p) => p.type === 'reply').length;
    const stmtCount = posts.filter((p) => p.type === 'statement').length;
    console.log(`\n========== 爬取完成 ==========`);
    console.log(`帖子 ID:      ${config.tid}`);
    console.log(`用户 ID:      ${config.authorid}`);
    console.log(`爬取页数:     ${totalPages} 页`);
    console.log(`发言总数:     ${posts.length} (问答 ${replyCount} / 发言 ${stmtCount})`);
    console.log(``);

    // 保存到文件
    const outputFile = config.outputFile || defaultOutputPath(config.tid, config.authorid);
    await saveResult(result, outputFile);
  } catch (err) {
    console.error('爬取出错:', err);
    process.exit(1);
  } finally {
    await scraper.destroy();
  }
}

main();
