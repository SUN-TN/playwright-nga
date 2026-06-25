import * as fs from 'node:fs';
import * as path from 'node:path';

// ===== 日期工具 =====

/** 解析 "2026-01-12 09:05" 格式为 Date */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/** 获取 ISO 周起始日期 (周一) */
export function getISOWeek(dateStr: string): { weekStart: string; weekEnd: string } {
  const d = parseDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(sunday),
  };
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 获取日期字符串的 YYYY-MM-DD 部分 */
export function getDatePrefix(dateStr: string): string {
  return dateStr.slice(0, 10);
}

// ===== 文本工具 =====

/** 去空白后的内容长度 */
export function contentLen(content: string): number {
  return content.replace(/\s+/g, '').length;
}

/** 是否包含数字 */
export function containsDigit(content: string): boolean {
  return /\d/.test(content);
}

/** 是否包含特定板块关键词 */
export function containsSectorKeyword(content: string, keywords: string[] = sectorKeywords): boolean {
  return keywords.some(kw => content.includes(kw));
}

// ===== 板块关键词列表 =====

export const sectorKeywords = [
  '半导体', '芯片', '光刻', '设备', '存储',
  '航天', '卫星', '火箭',
  'AI', '人工智能', '应用', '软件', 'CPO', '光模块', '光通信',
  '算力', 'AIDC', '数据中心',
  '新能源', '电池', '光伏', '风电', '锂电',
  '稀土', '矿', '资源',
  '有色', '铜', '铝', '黄金', '白银',
  '化工',
  '石油', '天然气', '油气',
  '金融', '券商', '银行', '保险',
  '机器人', '自动化',
  '医药', '医疗', '创新药',
];

// ===== 文件工具 =====

/** 确保目录存在 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** 读取 JSON 文件 */
export function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

/** 保存 JSON 文件 */
export function saveJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** 保存文本/Markdown 文件 */
export function saveText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** 排序 Map 的 entries 按值降序 */
export function sortByValue<T>(map: Record<string, number>): [string, number][] {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** 计算两个字符串的 Jaccard 相似度 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/** 计算字符级相似度（简化版） */
export function charSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 0;
  let matches = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) matches++;
  }
  return matches / longer.length;
}
