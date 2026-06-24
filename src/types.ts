/** 单个用户信息 */
export interface UserInfo {
  uid: number;
  username: string;
}

/** 爬虫配置 */
export interface ScrapeConfig {
  /** 帖子 ID */
  tid: number;
  /** 是否无头模式，默认 true */
  headless?: boolean;
  /** 翻页间隔(ms)，默认 2000 */
  pageDelay?: number;
  /** 最大页数限制，默认 999 */
  maxPages?: number;
  /** 输出文件路径（可选），不传则只打印到控制台 */
  outputFile?: string;
}

/** 爬取结果 */
export interface ScrapeResult {
  tid: number;
  totalPages: number;
  totalPosts: number;
  users: UserInfo[];
  scrapedAt: string;
}

/** NGA API 响应（read.php?__output=11 格式） */
export interface NgaApiResponse {
  data: {
    __U?: Record<string, { username: string }>;
    __R?: Record<string, unknown> | unknown[];
  };
  error?: [number, string];
}
