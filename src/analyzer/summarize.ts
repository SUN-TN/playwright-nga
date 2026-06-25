import {
  type ClassifiedPost,
  type KnowledgeResult,
  type TimelineResult,
  type ScoringResult,
  type DailyDigest,
  type WeeklyReport,
  type SummaryOutput,
} from './types.js';
import { getDatePrefix } from './utils.js';

// ===== L1 - 一句话日报 =====

export function generateDailyDigests(
  posts: ClassifiedPost[],
  scored: ScoringResult,
): DailyDigest[] {
  // 按日期分组，每天取最高分发言作为摘要
  const dayMap = new Map<string, ClassifiedPost[]>();

  for (const p of posts) {
    const day = getDatePrefix(p.date);
    const existing = dayMap.get(day) || [];
    existing.push(p);
    dayMap.set(day, existing);
  }

  // 建立 floor -> score 的映射
  const scoreMap = new Map<number, number>();
  for (const s of scored.posts) scoreMap.set(s.floor, s.score);

  const digests: DailyDigest[] = [];

  for (const [date, dayPosts] of dayMap) {
    // 取最高分发言
    const best = dayPosts.reduce((a, b) =>
      (scoreMap.get(a.floor) || 0) > (scoreMap.get(b.floor) || 0) ? a : b,
    );

    const coreTopic = best.topics.slice(0, 2).join('/') || '综合';
    const indexJudgment = extractIndexJudgment(dayPosts);
    const keyAction = extractKeyAction(dayPosts);

    digests.push({ date, coreTopic, keyAction, indexJudgment });
  }

  digests.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[Summarize] 生成 ${digests.length} 条日报`);
  return digests;
}

// ===== L2 - 周度简报（Markdown） =====

export function generateWeeklyReports(
  timeline: TimelineResult,
  posts: ClassifiedPost[],
  knowledge: KnowledgeResult,
): WeeklyReport[] {
  return timeline.weeklySummaries.map(ws => {
    // 本周发言
    const weekPosts = posts.filter(p => {
      const d = getDatePrefix(p.date);
      return d >= ws.weekStart && d <= ws.weekEnd;
    });

    // 板块轮动
    const topSectors = Object.entries(ws.sectorMentions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, c]) => `${s}(${c})`)
      .join(' → ');

    // 指数区间
    const indexRange = extractWeekIndexRange(weekPosts, knowledge);

    // 仓位建议
    const positionAdvice = extractPositionAdvice(weekPosts);

    // Top 5 发言摘录（按内容长度取最有价值的）
    const topPosts = weekPosts
      .filter(p => p.depth === 'deep' || p.depth === 'medium')
      .sort((a, b) => b.contentLength - a.contentLength)
      .slice(0, 5)
      .map(p => ({
        floor: p.floor,
        date: p.date,
        excerpt: p.content.replace(/\s+/g, ' ').slice(0, 150),
      }));

    return {
      weekStart: ws.weekStart,
      weekEnd: ws.weekEnd,
      indexRange,
      sectorRotation: topSectors || '无明显轮动',
      positionAdvice,
      topPosts,
    };
  });
}

// ===== L3 - 总纲总结（Markdown 长文） =====

export function generateMasterReport(
  timeline: TimelineResult,
  knowledge: KnowledgeResult,
  scored: ScoringResult,
  posts: ClassifiedPost[],
): string {
  const lines: string[] = [];

  lines.push('# NGA 股票讨论帖分析总纲');
  lines.push('');
  lines.push(`> 数据来源: NGA tid=45974302, authorid=150058`);
  lines.push(`> 时间跨度: ${getDatePrefix(posts[0]?.date || '')} 至 ${getDatePrefix(posts[posts.length - 1]?.date || '')}`);
  lines.push(`> 分析时间: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> 总发言数: ${posts.length + (scored.total - posts.length)} (清洗后 ${posts.length} 条)`);
  lines.push('');

  // 1. 交易体系总结
  lines.push('## 一、交易体系总结');
  lines.push('');
  lines.push('### 1.1 波浪理论标记体系');
  const waveStages = new Map<string, number>();
  for (const w of knowledge.waveMarkers) {
    waveStages.set(w.stage, (waveStages.get(w.stage) || 0) + 1);
  }
  for (const [stage, count] of [...waveStages.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${stage}**: ${count} 次提及`);
  }
  lines.push('');

  lines.push('### 1.2 关键交易规则');
  const ruleCats = new Map<string, string[]>();
  for (const r of knowledge.tradingRules.slice(0, 30)) {
    const existing = ruleCats.get(r.category) || [];
    if (existing.length < 5) {
      existing.push(`- [${r.date}] ${r.pattern.slice(0, 80)}`);
      ruleCats.set(r.category, existing);
    }
  }
  for (const [cat, rules] of ruleCats) {
    lines.push(`**${cat}**`);
    lines.push(...rules);
    lines.push('');
  }

  // 2. 板块轮动全景
  lines.push('## 二、板块轮动全景');
  lines.push('');
  lines.push('### 2.1 板块提及热度');
  lines.push('');
  lines.push('| 板块 | 提及次数 |');
  lines.push('|------|---------|');
  for (const [sector, count] of Object.entries(
    [...posts].reduce((acc, p) => {
      for (const s of p.sectors) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  ).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${sector} | ${count} |`);
  }
  lines.push('');

  lines.push('### 2.2 板块资金流动关系');
  for (const t of knowledge.sectorTransitions.slice(0, 10)) {
    lines.push(`- ${t.from} → ${t.to}: ${t.count} 次`);
  }
  lines.push('');

  // 3. 关键点位数据库
  lines.push('## 三、关键点位数据库');
  lines.push('');
  const levelMap = new Map<string, { type: string; count: number }>();
  for (const l of knowledge.keyLevels) {
    const existing = levelMap.get(l.value) || { type: l.type, count: 0 };
    existing.count++;
    levelMap.set(l.value, existing);
  }
  lines.push('| 点位 | 类型 | 提及次数 |');
  lines.push('|------|------|---------|');
  for (const [value, info] of [...levelMap.entries()].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${value} | ${info.type} | ${info.count} |`);
  }
  lines.push('');

  // 4. 时间线关键转折点
  lines.push('## 四、时间线关键转折点');
  lines.push('');
  if (timeline.turningPoints.length > 0) {
    lines.push('| 日期 | 当日发言数 | 7日均值 |');
    lines.push('|------|-----------|--------|');
    for (const tp of timeline.turningPoints) {
      lines.push(`| ${tp.date} | ${tp.count} | ${tp.avg7d} |`);
    }
  } else {
    lines.push('无显著转折点');
  }
  lines.push('');

  // 5. Top 20 高质量发言
  lines.push('## 五、Top 20 高质量发言精选');
  lines.push('');
  for (let i = 0; i < Math.min(20, scored.top200.length); i++) {
    const p = scored.top200[i];
    lines.push(`### ${i + 1}. [${p.date} Floor#${p.floor}] 得分: ${p.score}`);
    lines.push(`> ${p.content.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  // 6. 统计数据附录
  lines.push('## 六、统计数据附录');
  lines.push('');
  lines.push(`- 覆盖 ${timeline.weeklySummaries.length} 周`);
  lines.push(`- 日均发言 ${Math.round(posts.length / timeline.dailyActivity.length)} 条`);
  lines.push(`- deep级分析 ${posts.filter(p => p.depth === 'deep').length} 条`);
  lines.push(`- medium级分析 ${posts.filter(p => p.depth === 'medium').length} 条`);
  lines.push(`- 提取交易规则 ${knowledge.tradingRules.length} 条`);
  lines.push(`- 提取关键点位 ${knowledge.keyLevels.length} 条`);
  lines.push('');

  return lines.join('\n');
}

// ===== 辅助函数 =====

function extractIndexJudgment(dayPosts: ClassifiedPost[]): string {
  const indexPosts = dayPosts.filter(p => p.topics.includes('指数预判'));
  if (indexPosts.length === 0) return '无指数判断';
  const best = indexPosts.sort((a, b) => b.contentLength - a.contentLength)[0];
  return best.content.replace(/\s+/g, ' ').slice(0, 60);
}

function extractKeyAction(dayPosts: ClassifiedPost[]): string {
  const actionPosts = dayPosts.filter(p => p.topics.includes('交易策略'));
  if (actionPosts.length === 0) return '无操作提示';
  const best = actionPosts.sort((a, b) => b.contentLength - a.contentLength)[0];
  return best.content.replace(/\s+/g, ' ').slice(0, 40);
}

function extractWeekIndexRange(
  weekPosts: ClassifiedPost[],
  knowledge: KnowledgeResult,
): string {
  const weekDates = weekPosts.map(p => getDatePrefix(p.date));
  const minDate = weekDates.sort()[0] || '';
  const maxDate = weekDates.sort()[weekDates.length - 1] || '';

  const weekLevels = knowledge.keyLevels.filter(
    l => getDatePrefix(l.date) >= minDate && getDatePrefix(l.date) <= maxDate,
  );

  const supportLevels = weekLevels.filter(l => l.type === '支撑').map(l => l.value);
  const resistanceLevels = weekLevels.filter(l => l.type === '压力').map(l => l.value);

  const support = supportLevels.length > 0 ? supportLevels.join('/') : '--';
  const resistance = resistanceLevels.length > 0 ? resistanceLevels.join('/') : '--';

  return `支撑: ${support} | 压力: ${resistance}`;
}

function extractPositionAdvice(weekPosts: ClassifiedPost[]): string {
  const positionPosts = weekPosts.filter(p =>
    /仓位|满仓|空仓|成仓|[五六七八九]成/.test(p.content) && p.topics.includes('交易策略'),
  );
  if (positionPosts.length === 0) return '本周无明确仓位建议';
  const best = positionPosts.sort((a, b) => b.contentLength - a.contentLength)[0];
  return best.content.replace(/\s+/g, ' ').slice(0, 100);
}

// ===== 写入 Markdown 文件 =====

export function writeWeeklyReportsMarkdown(reports: WeeklyReport[]): string {
  const lines: string[] = [];
  lines.push('# NGA 股票讨论帖 - 周度简报');
  lines.push('');

  for (const r of reports.slice(-12)) { // 最近 12 周
    lines.push(`## ${r.weekStart} ~ ${r.weekEnd}`);
    lines.push('');
    lines.push(`- **指数区间**: ${r.indexRange}`);
    lines.push(`- **板块轮动**: ${r.sectorRotation}`);
    lines.push(`- **仓位建议**: ${r.positionAdvice}`);
    lines.push('');
    if (r.topPosts.length > 0) {
      lines.push('### 本周精选发言');
      lines.push('');
      for (const tp of r.topPosts) {
        lines.push(`- **[${tp.date} Floor#${tp.floor}]** ${tp.excerpt}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function writeDailyDigestsMarkdown(digests: DailyDigest[]): string {
  const lines: string[] = [];
  lines.push('# NGA 股票讨论帖 - 一句话日报');
  lines.push('');
  lines.push('| 日期 | 核心主题 | 关键操作 | 指数判断 |');
  lines.push('|------|---------|---------|---------|');

  for (const d of digests.slice(-30)) { // 最近 30 天
    lines.push(`| ${d.date} | ${d.coreTopic} | ${d.keyAction} | ${d.indexJudgment.slice(0, 40)} |`);
  }

  return lines.join('\n');
}

// ===== 主入口 =====

export function summarize(
  posts: ClassifiedPost[],
  timeline: TimelineResult,
  knowledge: KnowledgeResult,
  scored: ScoringResult,
): SummaryOutput {
  console.log('[Summarize] 开始生成多级摘要...');

  const dailyDigests = generateDailyDigests(posts, scored);
  const weeklyReports = generateWeeklyReports(timeline, posts, knowledge);
  const masterReport = generateMasterReport(timeline, knowledge, scored, posts);

  console.log(`[Summarize] 日报 ${dailyDigests.length} 条, 周报 ${weeklyReports.length} 条, 总纲 ${masterReport.length} 字符`);

  return { dailyDigests, weeklyReports, masterReport };
}
