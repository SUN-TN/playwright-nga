import {
  type CleanedPost,
  type ClassifiedPost,
  type ClassificationResult,
  type TopicTag,
  type SectorTag,
  type DepthTag,
} from './types.js';
import { contentLen } from './utils.js';

// ===== 主题关键词映射 =====

const topicKeywords: Record<TopicTag, RegExp> = {
  '指数预判': /点位|压力|支撑|颈线|突破|破位|站稳|加速|回踩|反抽|反弹|回调|目标位|3-[1-5]|浪[形型]/,
  '板块分析': /板块|轮动|方向|赛道|主线|支线|题材|概念/,
  '宏观联动': /美元|美债|黄金|原油|石油|加息|降息|美联储|通胀|地缘|战争|国债|汇率/,
  '资金分析': /量能|缩量|放量|两融|北向|机构|游资|量化|踏空|获利盘|卖盘|买盘|资金/,
  '交易策略': /做T|仓位|止盈|止损|减仓|加仓|满仓|空仓|轮动|躺死|打野|进场|出场|买入|卖出|抄底|追高/,
  '心态管理': /别急|不要|焦虑|怕什么|心态|贪|情绪|耐心|恐惧|贪婪|别慌|别怕|稳住|拿住/,
};

// ===== 板块关键词映射 =====

const sectorKeywords: Record<SectorTag, RegExp> = {
  '半导体': /半导体|芯片|光刻|存储|设备|晶圆|封测|国产替代|igbt/i,
  '商业航天': /航天|卫星|火箭|低轨|星链|军工|导航/i,
  'AI应用': /AI应用|人工智能.*应用|软件.*AI|AI.*软件|智能体|agent|大模型|GPT|AI助手/i,
  'AI硬件/CPO': /CPO|光模块|光通信|AI.*硬件|硬件.*AI|散热|PCB|服务器|交换机/i,
  'AIDC/算力': /算力|AIDC|数据中心|云计算|云服务|IDC|GPU/i,
  '新能源/电池': /新能源|电池|光伏|风电|锂电|储能|固态电池|钠电池|充电桩/i,
  '稀土': /稀土|永磁|磁材/i,
  '有色': /有色|铝|铜|锌|镍|贵金属/i,
  '化工': /化工|化学|材料|聚氨酯|MDI/i,
  '石油天然气': /石油|天然气|油气|中石油|中石化|中海油|页岩气/i,
  '金融/券商': /金融|券商|银行|保险|信托|东财/i,
  '机器人': /机器人|自动化|减速器|力控|关节/i,
  '医药': /医药|医疗|创新药|中药|CXO|生物/,
};

// ===== 技术深度判断 =====

const causalKeywords = /因为|所以|如果|导致|意味着|本质上|关键在于|逻辑是|原因在于|一方面.*另一方面/;

function classifyDepth(content: string): DepthTag {
  const len = contentLen(content);
  if (len >= 100 && causalKeywords.test(content)) {
    return 'deep';
  }
  if (len >= 30) {
    return 'medium';
  }
  return 'shallow';
}

// ===== 主分类函数 =====

export function classify(cleanedPosts: CleanedPost[]): ClassificationResult {
  const topicStats: Record<string, number> = {};
  const sectorStats: Record<string, number> = {};
  const depthStats: Record<string, number> = { deep: 0, medium: 0, shallow: 0 };

  const posts: ClassifiedPost[] = [];

  for (const p of cleanedPosts) {
    if (p.filtered) continue;

    const content = p.content;

    // 主题分类（多选）
    const topics: TopicTag[] = [];
    for (const [tag, regex] of Object.entries(topicKeywords)) {
      if (regex.test(content)) {
        topics.push(tag as TopicTag);
        topicStats[tag] = (topicStats[tag] || 0) + 1;
      }
    }

    // 板块分类（多选）
    const sectors: SectorTag[] = [];
    for (const [tag, regex] of Object.entries(sectorKeywords)) {
      if (regex.test(content)) {
        sectors.push(tag as SectorTag);
        sectorStats[tag] = (sectorStats[tag] || 0) + 1;
      }
    }

    // 技术深度
    const depth = classifyDepth(content);
    depthStats[depth]++;

    posts.push({
      ...p,
      topics,
      sectors,
      depth,
    });
  }

  console.log(`[Classify] 完成 ${posts.length} 条发言分类`);
  console.log(`[Classify] deep:${depthStats.deep} medium:${depthStats.medium} shallow:${depthStats.shallow}`);
  console.log(`[Classify] Top 主题: ${JSON.stringify(topN(topicStats, 5))}`);
  console.log(`[Classify] Top 板块: ${JSON.stringify(topN(sectorStats, 5))}`);

  return {
    total: posts.length,
    posts,
    topicStats: topicStats as Record<TopicTag, number>,
    sectorStats: sectorStats as Record<SectorTag, number>,
    depthStats: depthStats as Record<DepthTag, number>,
  };
}

function topN(stats: Record<string, number>, n: number): [string, number][] {
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
