import * as fs from 'node:fs';
import {
  type RawDataFile,
  type CleaningResult,
  type ClassificationResult,
  type KnowledgeResult,
  type TimelineResult,
  type ScoringResult,
} from './types.js';
import { readJson, saveJson, saveText, ensureDir } from './utils.js';
import { clean, getCleanedOnly } from './clean.js';
import { classify } from './classify.js';
import { extract } from './extract.js';
import { analyzeTimeline } from './timeline.js';
import { scorePosts } from './score.js';
import { summarize, writeWeeklyReportsMarkdown, writeDailyDigestsMarkdown } from './summarize.js';

// ===== 输出目录 =====
const OUT_DIR = 'output/analysis';

/** 自动查找最新的原始数据文件 */
function findLatestRawFile(): string {
  const files = fs.readdirSync('output');
  const jsonFiles = files
    .filter(f => f.startsWith('author_tid_') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (jsonFiles.length === 0) {
    throw new Error('output/ 目录下未找到 author_tid_*.json 文件');
  }
  return `output/${jsonFiles[0]}`;
}

// ===== 阶段一：噪音清洗 =====
function stage1(raw: RawDataFile): CleaningResult {
  console.log('\n========== 阶段一：噪音清洗 ==========');
  const result = clean(raw.posts);
  saveJson(`${OUT_DIR}/01-cleaned.json`, result);
  return result;
}

// ===== 阶段二：多维分类标注 =====
function stage2(cleaning: CleaningResult): ClassificationResult {
  console.log('\n========== 阶段二：多维分类标注 ==========');
  const result = classify(cleaning.posts);
  saveJson(`${OUT_DIR}/02-tagged.json`, result);
  return result;
}

// ===== 阶段三：技术知识抽取 =====
function stage3(classification: ClassificationResult): KnowledgeResult {
  console.log('\n========== 阶段三：技术知识抽取 ==========');
  const result = extract(classification.posts);
  saveJson(`${OUT_DIR}/03-knowledge.json`, result);
  return result;
}

// ===== 阶段四：时间线分析 =====
function stage4(classification: ClassificationResult): TimelineResult {
  console.log('\n========== 阶段四：时间线分析 ==========');
  const result = analyzeTimeline(classification.posts);
  saveJson(`${OUT_DIR}/04-timeline.json`, result);
  return result;
}

// ===== 阶段五：质量评分 =====
function stage5(classification: ClassificationResult): ScoringResult {
  console.log('\n========== 阶段五：质量评分 ==========');
  const result = scorePosts(classification.posts);
  saveJson(`${OUT_DIR}/05-scored.json`, result);
  return result;
}

// ===== 阶段六：分层总结输出 =====
function stage6(
  classification: ClassificationResult,
  knowledge: KnowledgeResult,
  timeline: TimelineResult,
  scored: ScoringResult,
): void {
  console.log('\n========== 阶段六：分层总结输出 ==========');
  const result = summarize(classification.posts, timeline, knowledge, scored);

  // 保存一句话日报
  const dailyMd = writeDailyDigestsMarkdown(result.dailyDigests);
  saveText(`${OUT_DIR}/daily-digests.md`, dailyMd);

  // 保存周度简报
  const weeklyMd = writeWeeklyReportsMarkdown(result.weeklyReports);
  saveText(`${OUT_DIR}/weekly-reports.md`, weeklyMd);

  // 保存总纲
  saveText(`${OUT_DIR}/master-report.md`, result.masterReport);

  // 保存结构数据
  saveJson(`${OUT_DIR}/06-summary.json`, result);
}

// ===== 主入口 =====

function main(): void {
  ensureDir(OUT_DIR);

  // 查找最新的原始数据文件
  const inputFile = process.argv[2] || findLatestRawFile();
  console.log(`[Pipeline] 读取数据: ${inputFile}`);

  const raw = readJson<RawDataFile>(inputFile);
  console.log(`[Pipeline] 原始发言数: ${raw.posts.length}`);

  // 顺序执行各阶段
  const cleaning = stage1(raw);
  const classification = stage2(cleaning);
  const knowledge = stage3(classification);
  const timeline = stage4(classification);
  const scored = stage5(classification);
  stage6(classification, knowledge, timeline, scored);

  console.log('\n========== 全部分析完成 ==========');
  console.log(`输出目录: ${OUT_DIR}/`);
  console.log('  01-cleaned.json    - 清洗结果');
  console.log('  02-tagged.json     - 分类标注结果');
  console.log('  03-knowledge.json  - 知识抽取结果');
  console.log('  04-timeline.json   - 时间线分析结果');
  console.log('  05-scored.json     - 质量评分结果');
  console.log('  06-summary.json    - 摘要结构化数据');
  console.log('  daily-digests.md   - 一句话日报');
  console.log('  weekly-reports.md  - 周度简报');
  console.log('  master-report.md   - 总纲长文报告');
}

main();
