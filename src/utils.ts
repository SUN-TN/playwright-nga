import { UserInfo, ScrapeResult } from './types.js';

/**
 * 合并多个用户列表，按 uid 去重（后出现的 username 覆盖先出现的）
 */
export function mergeUsers(pages: UserInfo[][]): UserInfo[] {
  const map = new Map<number, string>();
  for (const page of pages) {
    for (const user of page) {
      map.set(user.uid, user.username);
    }
  }
  return Array.from(map.entries())
    .map(([uid, username]) => ({ uid, username }))
    .sort((a, b) => a.uid - b.uid);
}

/**
 * 控制台打印用户列表表格
 */
export function printUsers(users: UserInfo[]): void {
  if (users.length === 0) {
    console.log('未找到任何用户。');
    return;
  }

  // 简单表格
  const header = `${'UID'.padEnd(10)} ${'用户名'}`;
  const sep = '─'.repeat(60);
  console.log(`\n共找到 ${users.length} 位发言用户：\n`);
  console.log(header);
  console.log(sep);
  for (const u of users) {
    console.log(`${String(u.uid).padEnd(10)} ${u.username}`);
  }
  console.log();
}

/**
 * 保存结果为 JSON 文件
 */
export async function saveResult(result: ScrapeResult, filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  // 确保输出目录存在
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`结果已保存到: ${filePath}`);
}
