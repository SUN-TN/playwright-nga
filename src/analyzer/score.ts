import {
  type ClassifiedPost,
  type ScoredPost,
  type ScoringResult,
} from './types.js';
import { contentLen, containsDigit } from './utils.js';

// ===== 信息密度评分 (0-30) =====

function scoreDensity(p: ClassifiedPost): number {
  let score = 0;
  // 含具体数值（点位/仓位/比例等）
  if (containsDigit(p.content)) score += 10;
  // 含因果推理
  if (/因为|所以|导致|意味着|本质上|关键|如果.*就|当.*时/.test(p.content)) score += 10;
  // 含多因素联动（2+个话题标签）
  if (p.topics.length >= 2) score += 10;
  return Math.min(score, 30);
}

// ===== 原创性评分 (0-25) =====

// 统计全局主题首次出现的 floor 集合
function buildFirstOccurrence(posts: ClassifiedPost[]): Map<string, number> {
  const firstSeen = new Map<string, number>();
  for (const p of posts) {
    // 用前 30 个字符作为指纹
    const fingerprint = p.content.replace(/\s+/g, '').slice(0, 30);
    if (!firstSeen.has(fingerprint)) {
      firstSeen.set(fingerprint, p.floor);
    }
  }
  return firstSeen;
}

function scoreOriginality(
  p: ClassifiedPost,
  firstSeenContent: Map<string, number>,
): number {
  let score = 0;
  // 内容指纹首次出现在全局
  const fingerprint = p.content.replace(/\s+/g, '').slice(0, 30);
  if (firstSeenContent.get(fingerprint) === p.floor) {
    score += 15;
  }
  // 独特表述（含反问/比喻/个人判断词）
  if (/我认为|我觉得|我判断|我倾向|不排除|大概率|确定性|本质上/.test(p.content)) {
    score += 10;
  }
  return Math.min(score, 25);
}

// ===== 可操作性评分 (0-25) =====

function scoreOperability(p: ClassifiedPost): number {
  let score = 0;
  // 明确买卖指令
  if (/可以买|可以进|可以打|可以加|可以卖|可以减|可以出|可以跑|干|梭|清仓/.test(p.content)) {
    score += 15;
  }
  // 含仓位建议
  if (/仓位|空仓|满仓|成仓|减仓|加仓|[五六七八九]成/.test(p.content)) {
    score += 10;
  }
  return Math.min(score, 25);
}

// ===== 验证性评分 (0-20) =====

function scoreVerification(p: ClassifiedPost): number {
  let score = 0;
  // 含点位预判
  if (/4\d{3}/.test(p.content)) score += 10;
  // 含时间预判
  if (/明天|下周|月底|季度|接下来.{1,20}[会可将]/.test(p.content)) score += 5;
  // 含量化判断
  if (/大概率|确定性|一定|肯定|必然|几乎/.test(p.content)) score += 5;
  return Math.min(score, 20);
}

// ===== 主评分函数 =====

export function scorePosts(posts: ClassifiedPost[]): ScoringResult {
  const firstSeenContent = buildFirstOccurrence(posts);
  const scored: ScoredPost[] = [];

  for (const p of posts) {
    const density = scoreDensity(p);
    const originality = scoreOriginality(p, firstSeenContent);
    const operability = scoreOperability(p);
    const verification = scoreVerification(p);
    const total = density + originality + operability + verification;

    scored.push({
      ...p,
      score: total,
      scoreDetail: { density, originality, operability, verification },
    });
  }

  // 排序取 Top 200
  scored.sort((a, b) => b.score - a.score);
  const top200 = scored.slice(0, 200);

  // 得分分布
  const distribution: Record<string, number> = {};
  for (const s of scored) {
    const range = s.score >= 80 ? '80-100' : s.score >= 60 ? '60-79' : s.score >= 40 ? '40-59' : s.score >= 20 ? '20-39' : '0-19';
    distribution[range] = (distribution[range] || 0) + 1;
  }

  console.log(`[Score] 完成 ${scored.length} 条评分`);
  console.log(`[Score] Top 200 最高分: ${top200[0]?.score} 最低分: ${top200[top200.length - 1]?.score}`);
  console.log(`[Score] 分布: ${JSON.stringify(distribution)}`);

  return {
    total: scored.length,
    posts: scored,
    top200,
    scoreDistribution: Object.entries(distribution).map(([range, count]) => ({ range, count })),
  };
}
