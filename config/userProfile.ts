/**
 * Default personalized profile for the hybrid almanac engine.
 * Birth: 2004-05-19 Hong Kong Time (UTC+8).
 */

export interface UserProfile {
  /** ISO date of birth (civil calendar). */
  birthDate: string;
  /** IANA / offset label for birth timezone. */
  birthTimezone: string;
  /** UTC offset hours at birth (HKT = +8). */
  birthUtcOffsetHours: number;
  /** Chinese earthly branch of natal day pillar (申 = Monkey). */
  chineseBranch: string;
  /** Favorable day branches for this natal chart. */
  favorableBranches: readonly string[];
  /** Clash branch (日沖本人). */
  clashBranch: string;
  /** Natal Sun ecliptic longitude in degrees (≈ Taurus 58°). */
  natalSunLongitude: number;
  /** Natal Sun zodiac sign name (English). */
  natalSunSign: string;
  /** Harmonious Western signs relative to natal Sun. */
  harmoniousSigns: readonly string[];
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  birthDate: '2004-05-19',
  birthTimezone: 'Asia/Hong_Kong',
  birthUtcOffsetHours: 8,
  chineseBranch: '申',
  favorableBranches: ['子', '辰', '巳'],
  clashBranch: '寅',
  natalSunLongitude: 58,
  natalSunSign: 'Taurus',
  harmoniousSigns: ['Taurus', 'Virgo', 'Capricorn', 'Cancer', 'Pisces'],
};

/** Intent filters for personalized auspicious-date scoring. */
export type Intent =
  | 'EXAM'
  | 'DRIVING'
  | 'INTERVIEW'
  | 'WEDDING'
  | 'MOVE'
  | 'SIGNING'
  | 'OPENING'
  | 'MEDICAL'
  | 'STUDY'
  | 'TRAVEL'
  | 'INVESTMENT'
  | 'GENERAL';

export const INTENT_LABELS: Record<Intent, string> = {
  EXAM: '考試',
  DRIVING: '出行／駕駛',
  INTERVIEW: '面試',
  WEDDING: '嫁娶／婚禮',
  MOVE: '搬家／入宅',
  SIGNING: '簽約／立約',
  OPENING: '開業／開市',
  MEDICAL: '求醫／手術',
  STUDY: '入學／進修',
  TRAVEL: '旅行／遠行',
  INVESTMENT: '投資／理財',
  GENERAL: '諸事通用',
};

export const ALL_INTENTS = Object.keys(INTENT_LABELS) as Intent[];

export function isIntent(raw: unknown): raw is Intent {
  return typeof raw === 'string' && (ALL_INTENTS as string[]).includes(raw.toUpperCase());
}

export function parseIntent(raw: unknown, fallback: Intent = 'GENERAL'): Intent | null {
  if (raw == null || raw === '') return fallback;
  const key = String(raw).toUpperCase() as Intent;
  return isIntent(key) ? key : null;
}
