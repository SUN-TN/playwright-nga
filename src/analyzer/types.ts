// ===== 原始数据类型 =====

/** 引用内容 */
export interface QuoteInfo {
  user: string;
  date: string;
  text: string;
}

/** 原始发言（来自作者爬虫产出） */
export interface RawPost {
  floor: number;
  date: string;
  type: 'statement' | 'reply';
  content: string;
  quote?: QuoteInfo;
}

/** 原始数据文件结构 */
export interface RawDataFile {
  tid: number;
  authorid: number;
  posts: RawPost[];
}

// ===== 阶段一产出：清洗后的发言 =====

export interface CleanedPost extends RawPost {
  /** 内容长度（去空白后） */
  contentLength: number;
  /** 是否被过滤 */
  filtered: boolean;
  /** 过滤原因 */
  filterReason?: string;
}

export interface CleaningResult {
  total: number;
  kept: number;
  filtered: number;
  posts: CleanedPost[];
  /** 仅保留的被过滤发帖统计 */
  filterStats: Record<string, number>;
}

// ===== 阶段二产出：分类标注 =====

/** 主题类型标签 */
export type TopicTag =
  | '指数预判'
  | '板块分析'
  | '宏观联动'
  | '资金分析'
  | '交易策略'
  | '心态管理';

/** 板块标签 */
export type SectorTag =
  | '半导体'
  | '商业航天'
  | 'AI应用'
  | 'AI硬件/CPO'
  | 'AIDC/算力'
  | '新能源/电池'
  | '稀土'
  | '有色'
  | '化工'
  | '石油天然气'
  | '金融/券商'
  | '机器人'
  | '医药';

/** 技术深度 */
export type DepthTag = 'deep' | 'medium' | 'shallow';

export interface ClassifiedPost extends CleanedPost {
  topics: TopicTag[];
  sectors: SectorTag[];
  depth: DepthTag;
}

export interface ClassificationResult {
  total: number;
  posts: ClassifiedPost[];
  topicStats: Record<TopicTag, number>;
  sectorStats: Record<SectorTag, number>;
  depthStats: Record<DepthTag, number>;
}

// ===== 阶段三产出：知识抽取 =====

export interface WaveMarker {
  stage: string;      // e.g. "3-3", "3-4"
  date: string;
  floor: number;
  context: string;
}

export interface KeyLevel {
  value: string;       // e.g. "4006", "4167-4176"
  date: string;
  floor: number;
  type: '支撑' | '压力' | '颈线' | '目标' | '不明确';
  context: string;
}

export interface TradingRule {
  pattern: string;     // 匹配到的规则原文
  date: string;
  floor: number;
  category: '做T' | '仓位' | '止损' | '止盈' | '买入' | '卖出' | '确认' | '其他';
}

export interface SectorTransition {
  from: SectorTag;
  to: SectorTag;
  count: number;
}

export interface KnowledgeResult {
  waveMarkers: WaveMarker[];
  keyLevels: KeyLevel[];
  tradingRules: TradingRule[];
  sectorTransitions: SectorTransition[];
}

// ===== 阶段四产出：时间线分析 =====

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  postCount: number;
  topicDistribution: Record<string, number>;
  sectorMentions: Record<string, number>;
}

export interface TimelineResult {
  weeklySummaries: WeeklySummary[];
  /** 按日统计发言数 */
  dailyActivity: { date: string; count: number }[];
  /** 关键转折点（发言量超过 7 日均线 2 倍） */
  turningPoints: { date: string; count: number; avg7d: number }[];
}

// ===== 阶段五产出：质量评分 =====

export interface ScoredPost extends ClassifiedPost {
  score: number;
  scoreDetail: {
    density: number;    // 信息密度分 (0-30)
    originality: number; // 原创性分 (0-25)
    operability: number; // 可操作性分 (0-25)
    verification: number; // 验证性分 (0-20)
  };
}

export interface ScoringResult {
  total: number;
  posts: ScoredPost[];
  top200: ScoredPost[];
  scoreDistribution: { range: string; count: number }[];
}

// ===== 阶段六产出：摘要 =====

export interface DailyDigest {
  date: string;
  coreTopic: string;
  keyAction: string;
  indexJudgment: string;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  indexRange: string;
  sectorRotation: string;
  positionAdvice: string;
  topPosts: { floor: number; date: string; excerpt: string }[];
}

export interface SummaryOutput {
  dailyDigests: DailyDigest[];
  weeklyReports: WeeklyReport[];
  masterReport: string;
}
