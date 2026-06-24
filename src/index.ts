import { NgaScraper } from './scraper.js';
import { ScrapeConfig, ScrapeResult } from './types.js';
import { mergeUsers, printUsers, saveResult } from './utils.js';

function printHelp(): void {
  console.log(`
NGA 帖子用户爬虫工具

用法:
  tsx src/index.ts --tid <帖子ID> [选项]

选项:
  --tid <number>       帖子 ID (必填，如 45974302)
  --headless <boolean> 是否无头模式 (默认 true)
  --delay <number>     翻页间隔毫秒数 (默认 2000)
  --max-pages <number> 最大爬取页数 (默认 999)
  --output <path>      输出 JSON 文件路径（默认自动生成到 output/ 目录）
  --no-headless        关闭无头模式，可视化浏览器操作
  --use-system-profile 使用宿主 Chrome 配置文件（复用 cookie，需先退出 Chrome）
  --help               显示此帮助

示例:
  tsx src/index.ts --tid 45974302
  tsx src/index.ts --tid 45974302 --output ./output/result.json
  tsx src/index.ts --tid 45974302 --no-headless --delay 3000
  tsx src/index.ts --tid 45974302 --use-system-profile`);
}

function parseArgs(): ScrapeConfig | null {
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

  // --use-system-profile
  const useSystemProfile = args.includes('--use-system-profile');

  return { tid, headless, pageDelay: delay, maxPages, outputFile, useSystemProfile };
}

/** 生成默认输出文件路径：output/tid_{tid}_{YYYY-MM-DD_HH-mm-ss}.json */
function defaultOutputPath(tid: number): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `output/tid_${tid}_${ts}.json`;
}

async function main(): Promise<void> {
  const config = parseArgs();
  if (!config) {
    process.exit(1);
  }

  const scraper = new NgaScraper(config);

  try {
    await scraper.initialize();

    // 持久化模式下先检测登录状态
    if (config.useSystemProfile) {
      await scraper.ensureLoggedIn();
    } else {
      console.log(`开始爬取 NGA 帖子 tid=${config.tid}...\n`);
    }

    const { pages, totalPages } = await scraper.getAllPages();
    const allUsers = mergeUsers(pages);

    const totalPosts = pages.reduce((sum, p) => sum + p.length, 0);

    const result: ScrapeResult = {
      tid: config.tid,
      totalPages,
      totalPosts,
      users: allUsers,
      scrapedAt: new Date().toISOString(),
    };

    // 控制台输出
    console.log(`\n========== 爬取完成 ==========`);
    console.log(`帖子 ID:    ${config.tid}`);
    console.log(`爬取页数:   ${totalPages} 页`);
    console.log(`总楼层数:   ${totalPosts}`);
    console.log(`去重用户数: ${allUsers.length}`);
    printUsers(allUsers);

    // 保存到文件（默认按日期时间自动命名）
    const outputFile = config.outputFile || defaultOutputPath(config.tid);
    await saveResult(result, outputFile);
  } catch (err) {
    console.error('爬取出错:', err);
    process.exit(1);
  } finally {
    await scraper.destroy();
  }
}

main();
