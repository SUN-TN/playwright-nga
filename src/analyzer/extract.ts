import {
  type ClassifiedPost,
  type KnowledgeResult,
  type WaveMarker,
  type KeyLevel,
  type TradingRule,
  type SectorTransition,
  type SectorTag,
} from './types.js';

// ===== 波浪标记提取 =====

const wavePattern = /3-[1-5]\b/g;

export function extractWaveMarkers(posts: ClassifiedPost[]): WaveMarker[] {
  const markers: WaveMarker[] = [];
  for (const p of posts) {
    let match: RegExpExecArray | null;
    const re = new RegExp(wavePattern.source, 'g');
    while ((match = re.exec(p.content)) !== null) {
      markers.push({
        stage: match[0],
        date: p.date,
        floor: p.floor,
        context: extractContext(p.content, match.index, 80),
      });
    }
  }
  console.log(`[Extract] 提取波浪标记 ${markers.length} 条`);
  return markers;
}

// ===== 关键点位提取 =====

// 匹配 4xxx 或 4xxx-4xxx 格式
const levelPattern = /\b(4\d{3}(?:[-\s]?(?:至|到|—)?\s?4\d{3})?)\b/g;

// 点位修饰词判断类型
const supportWords = /支撑|防守|底线|不破|守住|守住|企稳|站稳/;
const resistanceWords = /压力|阻力|上沿|顶部|目标|冲[击刺]|突破|过去/;
const necklineWords = /颈线/;

export function extractKeyLevels(posts: ClassifiedPost[]): KeyLevel[] {
  const levels: KeyLevel[] = [];
  for (const p of posts) {
    let match: RegExpExecArray | null;
    const re = new RegExp(levelPattern.source, 'g');
    while ((match = re.exec(p.content)) !== null) {
      const value = match[1].replace(/\s+/g, '');
      const ctx = extractContext(p.content, match.index, 60);
      const type = necklineWords.test(ctx)
        ? '颈线'
        : supportWords.test(ctx)
          ? '支撑'
          : resistanceWords.test(ctx)
            ? '压力'
            : '不明确';

      levels.push({ value, date: p.date, floor: p.floor, type, context: ctx });
    }
  }
  console.log(`[Extract] 提取关键点位 ${levels.length} 条`);
  return levels;
}

// ===== 交易规则提取 =====

const rulePatterns: { pattern: RegExp; category: TradingRule['category'] }[] = [
  { pattern: /如果.{1,50}就.{1,80}(?:[。！])?/g, category: '确认' },
  { pattern: /当.{1,50}(?:时|的时候).{1,50}就.{1,80}(?:[。！])?/g, category: '确认' },
  { pattern: /做T.{1,60}(?:[。！]|$)/g, category: '做T' },
  { pattern: /仓位.{1,80}(?:[。！]|$)/g, category: '仓位' },
  { pattern: /止损.{1,60}(?:[。！]|$)/g, category: '止损' },
  { pattern: /止盈.{1,60}(?:[。！]|$)/g, category: '止盈' },
  { pattern: /可以买|可以打|可以进|可以上.{1,60}(?:[。！]|$)/g, category: '买入' },
  { pattern: /可以卖|可以出|可以减|可以跑.{1,60}(?:[。！]|$)/g, category: '卖出' },
];

export function extractTradingRules(posts: ClassifiedPost[]): TradingRule[] {
  const rules: TradingRule[] = [];
  for (const p of posts) {
    for (const { pattern, category } of rulePatterns) {
      const matches = p.content.matchAll(new RegExp(pattern.source, 'g'));
      for (const m of matches) {
        rules.push({
          pattern: m[0].trim(),
          date: p.date,
          floor: p.floor,
          category,
        });
      }
    }
  }
  console.log(`[Extract] 提取交易规则 ${rules.length} 条`);

  // 按类别统计
  const catStats: Record<string, number> = {};
  for (const r of rules) catStats[r.category] = (catStats[r.category] || 0) + 1;
  console.log(`[Extract] 规则分类: ${JSON.stringify(catStats)}`);

  return rules;
}

// ===== 板块轮动提取 =====

export function extractSectorFlow(posts: ClassifiedPost[]): SectorTransition[] {
  const transitionCount: Record<string, number> = {};

  // 在相邻发言中，如果一条属于板块A，下一条属于板块B，记录转移
  for (let i = 1; i < posts.length; i++) {
    const prevSectors = posts[i - 1].sectors;
    const currSectors = posts[i].sectors;

    for (const from of prevSectors) {
      for (const to of currSectors) {
        if (from !== to) {
          const key = `${from}→${to}`;
          transitionCount[key] = (transitionCount[key] || 0) + 1;
        }
      }
    }
  }

  const transitions: SectorTransition[] = Object.entries(transitionCount)
    .map(([key, count]) => {
      const [from, to] = key.split('→') as [SectorTag, SectorTag];
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  console.log(`[Extract] 板块轮动链路 ${transitions.length} 条，Top 5:`);
  for (const t of transitions.slice(0, 5)) {
    console.log(`  ${t.from} → ${t.to}: ${t.count}次`);
  }

  return transitions;
}

// ===== 工具 =====

function extractContext(text: string, position: number, radius: number): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ===== 主入口 =====

export function extract(posts: ClassifiedPost[]): KnowledgeResult {
  return {
    waveMarkers: extractWaveMarkers(posts),
    keyLevels: extractKeyLevels(posts),
    tradingRules: extractTradingRules(posts),
    sectorTransitions: extractSectorFlow(posts),
  };
}
