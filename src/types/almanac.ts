import type { Intent } from '../../config/userProfile.js';

/** Western zodiac sign derived from ecliptic longitude. */
export type ZodiacSign =
  | 'Aries'
  | 'Taurus'
  | 'Gemini'
  | 'Cancer'
  | 'Leo'
  | 'Virgo'
  | 'Libra'
  | 'Scorpio'
  | 'Sagittarius'
  | 'Capricorn'
  | 'Aquarius'
  | 'Pisces';

export type AspectKind = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';
export type AspectQuality = 'harmonious' | 'challenging' | 'neutral';

export interface AspectHit {
  body: 'Sun' | 'Moon' | 'Mercury' | 'Jupiter';
  kind: AspectKind;
  quality: AspectQuality;
  orb: number;
  angle: number;
  bodyLongitude: number;
}

export interface PlanetaryLongitudes {
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
}

export interface ShiChenHour {
  /** Earthly branch of the double-hour (子…亥). */
  branch: string;
  ganZhi: string;
  /** Clock window in HKT, e.g. "07:00–08:59". */
  clockRange: string;
  startHour: number;
  endHour: number;
  /** 十二神 name (青龍 / 明堂 / …). */
  tianShen: string;
  /** 黃道 / 黑道. */
  daoType: string;
  /** 吉 / 凶. */
  luck: string;
  yi: string[];
  ji: string[];
  isDaytimeFocus: boolean;
  isAuspicious: boolean;
}

export interface TongshuDayReport {
  date: string;
  solarYmd: string;
  lunarSummary: string;
  /** Four Pillars 年月日時 (時柱 uses noon HKT for daytime representation). */
  fourPillars: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  dayGanZhi: string;
  dayBranch: string;
  /** 建除十二神 (建除滿平定執破危成收開閉). */
  jianChu: string;
  /** 十二值神 (青龍名堂等). */
  shiErShen: string;
  /** 黃道 / 黑道. */
  huangHeiDao: string;
  shiErShenLuck: string;
  yi: string[];
  ji: string[];
  jiShen: string[];
  /** 正統評分用凶煞（已過濾雜煞／俗例偏煞）. */
  xiongSha: string[];
  /** 被過濾之雜煞（僅備查，不評分）— 廣經堂取向. */
  folkShaFiltered: string[];
  /** 二十八宿（紀曆參考，吉凶毋需重視）. */
  xiu: string | null;
  xiuLuck: string | null;
  xiuNote: string | null;
  /** 日干月令生旺休囚. */
  wuxing: {
    dayStemElement: string | null;
    seasonElement: string | null;
    wangLevel: string;
    label: string;
  } | null;
  jieQi: string | null;
  /** Daytime 十二時辰 subset: 辰巳午未申. */
  daytimeHours: ShiChenHour[];
  flags: string[];
  /** 編輯說明引用. */
  orthodoxNote: string;
}

export interface AstrologyDayReport {
  date: string;
  longitudes: PlanetaryLongitudes;
  sunSign: ZodiacSign;
  moonSign: ZodiacSign;
  mercuryRetrograde: boolean;
  mercuryDelta: number;
  moonPhaseDegrees: number;
  aspectsToNatalSun: AspectHit[];
  insights: {
    exam: string[];
    driving: string[];
    focus: string[];
  };
  warnings: string[];
}

export interface ScoreBreakdownItem {
  source: 'tongshu' | 'astrology' | 'intent' | 'base';
  label: string;
  delta: number;
}

export interface DailyScoreReport {
  date: string;
  intent: Intent;
  score: number;
  tongshuScore: number;
  astrologyScore: number;
  breakdown: ScoreBreakdownItem[];
  flags: string[];
  warnings: string[];
  tongshu: TongshuDayReport;
  astrology: AstrologyDayReport;
  bestHours: ShiChenHour[];
  summaryZh: string;
}

/** Optional LLM polish hook — stub only, no paid API required. */
export interface LlmPolishHook {
  polishDailyBrief(json: DailyScoreReport): Promise<string>;
}
