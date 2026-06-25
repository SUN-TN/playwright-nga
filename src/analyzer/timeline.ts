import {
  type ClassifiedPost,
  type TimelineResult,
  type WeeklySummary,
} from './types.js';
import { getISOWeek, getDatePrefix, sortByValue } from './utils.js';

// ===== 按周聚合 =====

export function buildWeeklySummaries(posts: ClassifiedPost[]): WeeklySummary[] {
  const weekMap = new Map<string, ClassifiedPost[]>();

  for (const p of posts) {
    const { weekStart } = getISOWeek(p.date);
    const existing = weekMap.get(weekStart) || [];
    existing.push(p);
    weekMap.set(weekStart, existing);
  }

  const summaries: WeeklySummary[] = [];

  for (const [weekStart, weekPosts] of weekMap) {
    const weekEnd = getISOWeek(weekPosts[0].date).weekEnd;

    // 统计主题分布
    const topicDist: Record<string, number> = {};
    const sectorMentions: Record<string, number> = {};

    for (const p of weekPosts) {
      for (const t of p.topics) topicDist[t] = (topicDist[t] || 0) + 1;
      for (const s of p.sectors) sectorMentions[s] = (sectorMentions[s] || 0) + 1;
    }

    summaries.push({
      weekStart,
      weekEnd,
      postCount: weekPosts.length,
      topicDistribution: topicDist,
      sectorMentions,
    });
  }

  // 按周起始排序
  summaries.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  console.log(`[Timeline] 共 ${summaries.length} 个周级别聚合`);
  return summaries;
}

// ===== 每日活跃度 =====

export function buildDailyActivity(posts: ClassifiedPost[]): { date: string; count: number }[] {
  const dayMap = new Map<string, number>();

  for (const p of posts) {
    const day = getDatePrefix(p.date);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }

  const result = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`[Timeline] 共 ${result.length} 天有发言`);
  return result;
}

// ===== 关键转折点识别 =====

export function findTurningPoints(
  dailyActivity: { date: string; count: number }[],
): { date: string; count: number; avg7d: number }[] {
  const turning: { date: string; count: number; avg7d: number }[] = [];

  for (let i = 7; i < dailyActivity.length; i++) {
    // 计算前 7 日均值
    let sum = 0;
    for (let j = i - 7; j < i; j++) {
      sum += dailyActivity[j].count;
    }
    const avg7d = sum / 7;

    // 超过 2 倍标记为转折点
    if (dailyActivity[i].count > avg7d * 2) {
      turning.push({
        date: dailyActivity[i].date,
        count: dailyActivity[i].count,
        avg7d: Math.round(avg7d * 10) / 10,
      });
    }
  }

  console.log(`[Timeline] 识别 ${turning.length} 个关键转折点`);
  return turning;
}

// ===== 主入口 =====

export function analyzeTimeline(posts: ClassifiedPost[]): TimelineResult {
  const weeklySummaries = buildWeeklySummaries(posts);
  const dailyActivity = buildDailyActivity(posts);
  const turningPoints = findTurningPoints(dailyActivity);

  // 打印统计摘要
  const totalWeeks = weeklySummaries.length;
  const totalDays = dailyActivity.length;
  const maxDay = dailyActivity.reduce((m, d) => d.count > m.count ? d : m, dailyActivity[0]);

  console.log(`[Timeline] 覆盖 ${totalWeeks} 周 / ${totalDays} 天`);
  console.log(`[Timeline] 最活跃日: ${maxDay.date} (${maxDay.count}条)`);

  if (turningPoints.length > 0) {
    console.log(`[Timeline] 转折点:`);
    for (const tp of turningPoints.slice(0, 10)) {
      console.log(`  ${tp.date}: ${tp.count}条 (7日均 ${tp.avg7d})`);
    }
  }

  return { weeklySummaries, dailyActivity, turningPoints };
}
