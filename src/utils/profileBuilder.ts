/**
 * Build a personalized UserProfile from birth date + optional 星座 / 生肖.
 * Used by the interactive择日 dashboard so anyone can input their chart.
 */

import { Solar } from 'lunar-typescript';
import type { UserProfile } from '../../config/userProfile.js';
import type { ZodiacSign } from '../types/almanac.js';
import {
  geocentricEclipticLongitude,
  hktNoon,
  longitudeToSign,
  SIGN_NAMES,
} from './astronomyCore.js';

/** 生肖 → 地支 */
export const ZODIAC_TO_BRANCH: Record<string, string> = {
  鼠: '子',
  牛: '丑',
  虎: '寅',
  兔: '卯',
  龍: '辰',
  龙: '辰',
  蛇: '巳',
  馬: '午',
  马: '午',
  羊: '未',
  猴: '申',
  雞: '酉',
  鸡: '酉',
  狗: '戌',
  豬: '亥',
  猪: '亥',
};

/** 地支 → 生肖（繁中） */
export const BRANCH_TO_ZODIAC: Record<string, string> = {
  子: '鼠',
  丑: '牛',
  寅: '虎',
  卯: '兔',
  辰: '龍',
  巳: '蛇',
  午: '馬',
  未: '羊',
  申: '猴',
  酉: '雞',
  戌: '狗',
  亥: '豬',
};

export const CHINESE_ZODIAC_LIST = [
  '鼠',
  '牛',
  '虎',
  '兔',
  '龍',
  '蛇',
  '馬',
  '羊',
  '猴',
  '雞',
  '狗',
  '豬',
] as const;

export const WESTERN_SIGN_LABELS: Record<ZodiacSign, string> = {
  Aries: '牡羊座',
  Taurus: '金牛座',
  Gemini: '雙子座',
  Cancer: '巨蟹座',
  Leo: '獅子座',
  Virgo: '處女座',
  Libra: '天秤座',
  Scorpio: '天蠍座',
  Sagittarius: '射手座',
  Capricorn: '摩羯座',
  Aquarius: '水瓶座',
  Pisces: '雙魚座',
};

/** Mid-sign ecliptic longitude for each Western sign (when user picks sign without precise birth time). */
const SIGN_MID_LONGITUDE: Record<ZodiacSign, number> = {
  Aries: 15,
  Taurus: 45,
  Gemini: 75,
  Cancer: 105,
  Leo: 135,
  Virgo: 165,
  Libra: 195,
  Scorpio: 225,
  Sagittarius: 255,
  Capricorn: 285,
  Aquarius: 315,
  Pisces: 345,
};

const SIGN_ELEMENT: Record<ZodiacSign, 'fire' | 'earth' | 'air' | 'water'> = {
  Aries: 'fire',
  Leo: 'fire',
  Sagittarius: 'fire',
  Taurus: 'earth',
  Virgo: 'earth',
  Capricorn: 'earth',
  Gemini: 'air',
  Libra: 'air',
  Aquarius: 'air',
  Cancer: 'water',
  Scorpio: 'water',
  Pisces: 'water',
};

/** 六沖 */
const CLASH_PAIR: Record<string, string> = {
  子: '午',
  午: '子',
  丑: '未',
  未: '丑',
  寅: '申',
  申: '寅',
  卯: '酉',
  酉: '卯',
  辰: '戌',
  戌: '辰',
  巳: '亥',
  亥: '巳',
};

/** 六合 */
const HARMONY_PAIR: Record<string, string> = {
  子: '丑',
  丑: '子',
  寅: '亥',
  亥: '寅',
  卯: '戌',
  戌: '卯',
  辰: '酉',
  酉: '辰',
  巳: '申',
  申: '巳',
  午: '未',
  未: '午',
};

/** 三合 groups */
const TRINE_GROUPS: string[][] = [
  ['申', '子', '辰'],
  ['亥', '卯', '未'],
  ['寅', '午', '戌'],
  ['巳', '酉', '丑'],
];

export interface ProfileInput {
  /** Civil birth date YYYY-MM-DD (required). */
  birthDate: string;
  /** Western sun sign (English). Optional — derived from birth date if omitted. */
  westernSign?: string;
  /** Chinese zodiac animal 生肖. Optional — derived from lunar year if omitted. */
  chineseZodiac?: string;
  /** Prefer day-pillar branch instead of year 生肖 for clash scoring. Default false. */
  useDayBranch?: boolean;
  birthTimezone?: string;
  birthUtcOffsetHours?: number;
}

export interface BuiltProfileMeta {
  profile: UserProfile;
  chineseZodiac: string;
  westernSignZh: string;
  derivedWesternSign: ZodiacSign;
  derivedYearZodiac: string;
  derivedDayBranch: string;
  natalSunLongitudeExact: number;
  notes: string[];
}

function parseWesternSign(raw?: string): ZodiacSign | null {
  if (!raw) return null;
  const t = raw.trim();
  for (const s of SIGN_NAMES) {
    if (s.toLowerCase() === t.toLowerCase()) return s;
    if (WESTERN_SIGN_LABELS[s] === t || WESTERN_SIGN_LABELS[s].replace('座', '') === t.replace('座', '')) {
      return s;
    }
  }
  return null;
}

function parseChineseZodiac(raw?: string): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/座$/, '').replace(/^生肖/, '');
  if (ZODIAC_TO_BRANCH[t]) return t === '龙' ? '龍' : t === '马' ? '馬' : t === '鸡' ? '雞' : t === '猪' ? '豬' : BRANCH_TO_ZODIAC[ZODIAC_TO_BRANCH[t]] ?? t;
  // Allow branch input 申
  if (BRANCH_TO_ZODIAC[t]) return BRANCH_TO_ZODIAC[t]!;
  return null;
}

function favorableBranchesFor(branch: string): string[] {
  const set = new Set<string>();
  for (const g of TRINE_GROUPS) {
    if (g.includes(branch)) {
      for (const b of g) if (b !== branch) set.add(b);
    }
  }
  const he = HARMONY_PAIR[branch];
  if (he) set.add(he);
  return [...set];
}

function harmoniousSignsFor(sign: ZodiacSign): ZodiacSign[] {
  const el = SIGN_ELEMENT[sign];
  const same = SIGN_NAMES.filter((s) => SIGN_ELEMENT[s] === el);
  // Sextile partners: earth↔water, fire↔air
  const partnerEl = el === 'earth' || el === 'water' ? (el === 'earth' ? 'water' : 'earth') : el === 'fire' ? 'air' : 'fire';
  const idx = SIGN_NAMES.indexOf(sign);
  const sextile = [SIGN_NAMES[(idx + 2) % 12]!, SIGN_NAMES[(idx + 10) % 12]!].filter(
    (s) => SIGN_ELEMENT[s] === partnerEl || true,
  );
  return [...new Set([...same, ...sextile])];
}

function isValidYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(Date.parse(`${ymd}T12:00:00+08:00`));
}

/**
 * Build a full UserProfile from form input.
 * Birth date drives exact natal Sun longitude; 星座／生肖 can override labels used for scoring affinities.
 */
export function buildProfileFromInput(input: ProfileInput): BuiltProfileMeta {
  if (!isValidYmd(input.birthDate)) {
    throw new Error('出生日期格式須為 YYYY-MM-DD');
  }

  const notes: string[] = [];
  const noon = hktNoon(input.birthDate);
  const natalSunLongitudeExact = geocentricEclipticLongitude('Sun', noon);
  const derivedWesternSign = longitudeToSign(natalSunLongitudeExact);

  const { y, m, d } = (() => {
    const [yy, mm, dd] = input.birthDate.split('-').map(Number);
    return { y: yy!, m: mm!, d: dd! };
  })();
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  const derivedDayBranch = lunar.getDayZhi();
  const yearZhi = lunar.getYearZhi();
  const derivedYearZodiac = BRANCH_TO_ZODIAC[yearZhi] ?? '猴';

  const userSign = parseWesternSign(input.westernSign);
  const natalSunSign = userSign ?? derivedWesternSign;
  if (userSign && userSign !== derivedWesternSign) {
    notes.push(
      `您選的星座「${WESTERN_SIGN_LABELS[userSign]}」與出生當日太陽位置「${WESTERN_SIGN_LABELS[derivedWesternSign]}」不同；評分以您選定星座為親和基準，黃道經度仍用出生日實測。`,
    );
  }

  const userZodiac = parseChineseZodiac(input.chineseZodiac);
  const chineseZodiac = userZodiac ?? derivedYearZodiac;
  if (userZodiac && userZodiac !== derivedYearZodiac) {
    notes.push(
      `您選的生肖「${userZodiac}」與出生農曆年「${derivedYearZodiac}」不同；日沖／喜用支以您選定生肖地支為準。`,
    );
  }

  const yearBranch = ZODIAC_TO_BRANCH[chineseZodiac]!;
  const chineseBranch = input.useDayBranch ? derivedDayBranch : yearBranch;
  if (input.useDayBranch) {
    notes.push(`已改用出生日柱地支「${derivedDayBranch}」作為本人支。`);
  }

  // Longitude: prefer exact from birth date; if user forced a different sign, keep exact but record mid for display affinity
  const natalSunLongitude = natalSunLongitudeExact;

  const profile: UserProfile = {
    birthDate: input.birthDate,
    birthTimezone: input.birthTimezone ?? 'Asia/Hong_Kong',
    birthUtcOffsetHours: input.birthUtcOffsetHours ?? 8,
    chineseBranch,
    favorableBranches: favorableBranchesFor(chineseBranch),
    clashBranch: CLASH_PAIR[chineseBranch] ?? '寅',
    natalSunLongitude,
    natalSunSign,
    harmoniousSigns: harmoniousSignsFor(natalSunSign),
  };

  return {
    profile,
    chineseZodiac,
    westernSignZh: WESTERN_SIGN_LABELS[natalSunSign],
    derivedWesternSign,
    derivedYearZodiac,
    derivedDayBranch,
    natalSunLongitudeExact,
    notes,
  };
}

/** Suggest 星座／生肖 from birth date alone (for form auto-fill). */
export function suggestFromBirthDate(birthDate: string): {
  westernSign: ZodiacSign;
  westernSignZh: string;
  chineseZodiac: string;
  dayBranch: string;
  natalSunLongitude: number;
} {
  if (!isValidYmd(birthDate)) {
    throw new Error('出生日期格式須為 YYYY-MM-DD');
  }
  const lon = geocentricEclipticLongitude('Sun', hktNoon(birthDate));
  const westernSign = longitudeToSign(lon);
  const [y, m, d] = birthDate.split('-').map(Number);
  const lunar = Solar.fromYmd(y!, m!, d!).getLunar();
  const yearZhi = lunar.getYearZhi();
  return {
    westernSign,
    westernSignZh: WESTERN_SIGN_LABELS[westernSign],
    chineseZodiac: BRANCH_TO_ZODIAC[yearZhi] ?? '猴',
    dayBranch: lunar.getDayZhi(),
    natalSunLongitude: lon,
  };
}

export { SIGN_MID_LONGITUDE };
