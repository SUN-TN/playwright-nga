import {
  type RawPost,
  type CleanedPost,
  type CleaningResult,
} from './types.js';
import {
  contentLen,
  containsDigit,
  sectorKeywords,
  charSimilarity,
} from './utils.js';

// ===== 纯互动正则 =====
const pureInteractionPattern = /^(哈哈|懂了|nb|牛[比逼]?|好[的了]?|收到|感谢|支持|mark|学习|收藏|插眼|打卡|来了|顶|赞|666|强|同意|确实).{0,12}$/;

// ===== 纯表情/颜文字标签正则 =====
const emojiTagPattern = /^[\s\[]*[哭笑呆茶囧委屈闪光赞同][\s\]]*$/;

// ===== 噪音检测规则 =====

function isTooShort(content: string): boolean {
  const len = contentLen(content);
  // < 15 字 && 不含数字 && 不含板块关键词
  return len < 15 && !containsDigit(content) && !isSectorKeyword(content);
}

function isSectorKeyword(content: string): boolean {
  return sectorKeywords.some(kw => content.includes(kw));
}

function isPureInteraction(content: string): boolean {
  return pureInteractionPattern.test(content.replace(/\s+/g, ''));
}

function isPureEmojiReply(type: string, content: string): boolean {
  if (type !== 'reply') return false;
  const stripped = content.replace(/\[.*?\]/g, '').replace(/\s+/g, '');
  return stripped.length === 0 || stripped.length < 6;
}

function isSimilarToPrevious(
  content: string,
  prevContent: string | null,
): boolean {
  if (!prevContent) return false;
  const sim = charSimilarity(
    content.replace(/\s+/g, ''),
    prevContent.replace(/\s+/g, ''),
  );
  return sim > 0.85;
}

// ===== 主清洗函数 =====

export function clean(rawPosts: RawPost[]): CleaningResult {
  const filterStats: Record<string, number> = {
    tooShort: 0,
    pureInteraction: 0,
    pureEmoji: 0,
    similarToPrev: 0,
    kept: 0,
  };

  const posts: CleanedPost[] = [];
  let prevKeptContent: string | null = null;

  for (const raw of rawPosts) {
    const cl = contentLen(raw.content);
    let filtered = false;
    let filterReason: string | undefined;

    if (isPureEmojiReply(raw.type, raw.content)) {
      filtered = true;
      filterReason = '纯表情/颜文字回复';
      filterStats.pureEmoji++;
    } else if (isTooShort(raw.content)) {
      filtered = true;
      filterReason = '过短且无实质内容';
      filterStats.tooShort++;
    } else if (isPureInteraction(raw.content)) {
      filtered = true;
      filterReason = '纯互动/吹水';
      filterStats.pureInteraction++;
    } else if (isSimilarToPrevious(raw.content, prevKeptContent)) {
      filtered = true;
      filterReason = '与上一条高度相似(>85%)';
      filterStats.similarToPrev++;
    } else {
      filterStats.kept++;
    }

    if (!filtered) {
      prevKeptContent = raw.content;
    }

    posts.push({
      ...raw,
      contentLength: cl,
      filtered,
      filterReason,
    });
  }

  const kept = filterStats.kept;

  console.log(`[Clean] 总计 ${rawPosts.length} 条，保留 ${kept} 条，过滤 ${rawPosts.length - kept} 条`);
  console.log(`[Clean] 过短:${filterStats.tooShort} 纯互动:${filterStats.pureInteraction} 纯表情:${filterStats.pureEmoji} 重复:${filterStats.similarToPrev}`);

  return { total: rawPosts.length, kept, filtered: rawPosts.length - kept, posts, filterStats };
}

/** 仅返回未被过滤的发言 */
export function getCleanedOnly(result: CleaningResult): CleanedPost[] {
  return result.posts.filter(p => !p.filtered);
}
