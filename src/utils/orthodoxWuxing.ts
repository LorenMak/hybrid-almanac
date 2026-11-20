/**
 * 廣經堂通勝取向：以正統陰陽五行（生剋制化、生旺休囚）為主，
 * 二十八宿僅作曆注參考；雜煞／俗例偏煞不納入評分。
 *
 * 參考：廣經堂出版社通勝編輯說明（宜忌／神煞依陰陽五行；
 * 二十八宿本為紀曆，吉凶毋需重視；刪除雜煞以免錯失良辰）。
 */

export type WuXing = '木' | '火' | '土' | '金' | '水';
export type WangLevel = '旺' | '相' | '休' | '囚' | '死';

const STEM_WX: Record<string, WuXing> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};

const BRANCH_WX: Record<string, WuXing> = {
  寅: '木',
  卯: '木',
  巳: '火',
  午: '火',
  辰: '土',
  戌: '土',
  丑: '土',
  未: '土',
  申: '金',
  酉: '金',
  亥: '水',
  子: '水',
};

/** Month branch → seasonal dominant element (建旺之氣). */
const MONTH_SEASON_WX: Record<string, WuXing> = {
  寅: '木',
  卯: '木',
  辰: '土',
  巳: '火',
  午: '火',
  未: '土',
  申: '金',
  酉: '金',
  戌: '土',
  亥: '水',
  子: '水',
  丑: '土',
};

/** 相生：生我者、我生者 */
const SHENG: Record<WuXing, WuXing> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木',
};

/** 相剋 */
const KE: Record<WuXing, WuXing> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木',
};

/** 日干五行相對月令旺氣：旺／相／休／囚／死. */
export function wangLevelOf(element: WuXing, season: WuXing): WangLevel {
  if (element === season) return '旺';
  if (SHENG[season] === element) return '相';
  if (SHENG[element] === season) return '休';
  // 囚：克旺者
  if (KE[element] === season) return '囚';
  // 死：旺所克
  if (KE[season] === element) return '死';
  return '休';
}

export function analyzeDayWuxing(dayGanZhi: string, monthBranch: string): {
  dayStem: string;
  dayBranch: string;
  dayStemElement: WuXing | null;
  dayBranchElement: WuXing | null;
  seasonElement: WuXing | null;
  wangLevel: WangLevel;
  scoreDelta: number;
  label: string;
} {
  const dayStem = dayGanZhi[0] ?? '';
  const dayBranch = dayGanZhi[1] ?? '';
  const dayStemElement = STEM_WX[dayStem] ?? null;
  const dayBranchElement = BRANCH_WX[dayBranch] ?? null;
  const seasonElement = MONTH_SEASON_WX[monthBranch] ?? null;
  const wangLevel =
    dayStemElement && seasonElement
      ? wangLevelOf(dayStemElement, seasonElement)
      : ('休' as WangLevel);

  const scoreMap: Record<WangLevel, number> = {
    旺: 10,
    相: 6,
    休: 0,
    囚: -6,
    死: -10,
  };
  const scoreDelta = scoreMap[wangLevel];
  const label = seasonElement
    ? `日干${dayStem}（${dayStemElement}）月令${monthBranch}（${seasonElement}）${wangLevel}`
    : '五行月令資料不足';

  return {
    dayStem,
    dayBranch,
    dayStemElement,
    dayBranchElement,
    seasonElement,
    wangLevel,
    scoreDelta,
    label,
  };
}

/**
 * 雜煞／俗例偏煞關鍵字（廣經堂取向：刪除以免錯失良辰）。
 * 比對時用 includes，繁簡皆可。
 */
export const FOLK_SHA_KEYWORDS = [
  '三娘',
  '赤松',
  '董公',
  '受死',
  '往亡',
  '歸忌',
  '血支',
  '血忌',
  '月虛',
  '月煞',
  '重日',
  '復日',
  '臨日', // keep? actually 臨日 is sometimes core - leave out of filter
  '五虛',
  '九坎',
  '九焦',
  '天賊',
  '地賊',
  '四廢',
  '五離',
  '元武', // duplicate of 玄武 listing noise
  '招搖',
  '厭對',
  '大煞',
  '土符',
  '小耗',
  '大耗',
  '往亡',
] as const;

/** Core shensha aligned with ganzhi / major selections — keep these. */
export const CORE_SHA_KEEP = [
  '劫煞',
  '災煞',
  '灾煞',
  '歲煞',
  '月破',
  '歲破',
  '天刑',
  '天牢',
  '白虎',
  '朱雀',
  '死氣',
  '死神',
];

export function isFolkSha(name: string): boolean {
  // If explicitly core, keep
  if (CORE_SHA_KEEP.some((k) => name.includes(k))) return false;
  return FOLK_SHA_KEYWORDS.some((k) => name.includes(k));
}

/** Filter 凶煞 list for orthodox display / scoring. */
export function filterOrthodoxXiongSha(list: string[]): {
  core: string[];
  folkFiltered: string[];
} {
  const core: string[] = [];
  const folkFiltered: string[] = [];
  for (const item of list) {
    if (isFolkSha(item)) folkFiltered.push(item);
    else core.push(item);
  }
  return { core, folkFiltered };
}

/** 二十八宿：僅紀曆參考，不參與吉凶評分（廣經堂說明）. */
export function mansionReferenceNote(xiu: string, xiuLuck: string): string {
  return `二十八宿「${xiu}」（舊注${xiuLuck}）— 本為紀曆，吉凶毋需重視`;
}

export { STEM_WX, BRANCH_WX, MONTH_SEASON_WX, SHENG, KE };
