/**
 * Personalized hybrid scoring (通書 50% + 西洋占星 50% contribution model).
 *
 * Base 60, then apply Tongshu / Astrology deltas; intent filters adjust
 * EXAM / DRIVING / INTERVIEW priorities. Clamp final score to 0–100.
 */

import type { Intent, UserProfile } from '../../config/userProfile.js';
import { INTENT_LABELS } from '../../config/userProfile.js';
import type {
  DailyScoreReport,
  ScoreBreakdownItem,
  ShiChenHour,
} from '../types/almanac.js';
import {
  getAstrologyDay,
  hasHarmoniousNatalAspect,
  isEarthMoonSign,
} from './astrologyEngine.js';
import {
  getTongshuDay,
  isAdverseJianChu,
  isFavorableJianChu,
} from './tongshuEngine.js';

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function pickBestHours(hours: ShiChenHour[]): ShiChenHour[] {
  const auspicious = hours.filter((h) => h.isAuspicious || h.luck === '吉');
  const pool = auspicious.length > 0 ? auspicious : hours;
  return [...pool].sort((a, b) => {
    const score = (h: ShiChenHour) =>
      (h.luck === '吉' ? 2 : 0) + (h.daoType === '黃道' ? 1 : 0);
    return score(b) - score(a);
  });
}

function intentAdjustments(
  intent: Intent,
  ctx: {
    jianChu: string;
    mercuryRx: boolean;
    hasHarmMercJup: boolean;
    clashDay: boolean;
    yueSuiPo: boolean;
    bestHours: ShiChenHour[];
  },
): ScoreBreakdownItem[] {
  const items: ScoreBreakdownItem[] = [];

  if (intent === 'EXAM') {
    if (isFavorableJianChu(ctx.jianChu)) {
      items.push({ source: 'intent', label: '考試宜成開定執', delta: 5 });
    }
    if (ctx.hasHarmMercJup) {
      items.push({ source: 'intent', label: '水星／木星和諧本命太陽（考試）', delta: 5 });
    }
    if (ctx.mercuryRx) {
      items.push({ source: 'intent', label: '水逆不利考試審題', delta: -5 });
    }
    if (ctx.clashDay || ctx.yueSuiPo) {
      items.push({ source: 'intent', label: '沖破之日不宜應試', delta: -10 });
    }
  }

  if (intent === 'DRIVING') {
    if (isAdverseJianChu(ctx.jianChu)) {
      items.push({ source: 'intent', label: '破危閉不利出行', delta: -8 });
    }
    if (ctx.mercuryRx) {
      items.push({ source: 'intent', label: '水逆出行需緩衝', delta: -5 });
    }
    if (ctx.bestHours.some((h) => h.luck === '吉')) {
      items.push({ source: 'intent', label: '日間有吉時辰可出門', delta: 5 });
    }
    if (ctx.yueSuiPo) {
      items.push({ source: 'intent', label: '月破／歲破諸事不宜出行', delta: -10 });
    }
  }

  if (intent === 'INTERVIEW') {
    if (['成', '开', '開'].includes(ctx.jianChu)) {
      items.push({ source: 'intent', label: '成／開日利面試', delta: 8 });
    }
    if (ctx.hasHarmMercJup) {
      items.push({ source: 'intent', label: '木星／水星和諧利表達', delta: 5 });
    }
    if (ctx.clashDay) {
      items.push({ source: 'intent', label: '日沖本人不利面試', delta: -12 });
    }
  }

  return items;
}

/**
 * Score one civil HKT date for a given intent against the user profile.
 */
export function scoreDay(
  dateYmd: string,
  intent: Intent,
  profile: UserProfile,
): DailyScoreReport {
  const tongshu = getTongshuDay(dateYmd, profile);
  const astrology = getAstrologyDay(dateYmd, profile);

  const breakdown: ScoreBreakdownItem[] = [
    { source: 'base', label: '基礎分', delta: 60 },
  ];

  let tongshuDelta = 0;
  let astrologyDelta = 0;

  // —— Tongshu track ——
  if (isFavorableJianChu(tongshu.jianChu)) {
    breakdown.push({
      source: 'tongshu',
      label: `建除「${tongshu.jianChu}」吉`,
      delta: 15,
    });
    tongshuDelta += 15;
  } else if (isAdverseJianChu(tongshu.jianChu)) {
    breakdown.push({
      source: 'tongshu',
      label: `建除「${tongshu.jianChu}」凶`,
      delta: -20,
    });
    tongshuDelta -= 20;
  }

  if (profile.favorableBranches.includes(tongshu.dayBranch)) {
    breakdown.push({
      source: 'tongshu',
      label: `日支「${tongshu.dayBranch}」合個人喜用`,
      delta: 15,
    });
    tongshuDelta += 15;
  }

  if (tongshu.dayBranch === profile.clashBranch) {
    breakdown.push({
      source: 'tongshu',
      label: '日沖本人',
      delta: -30,
    });
    tongshuDelta -= 30;
  }

  const yueSuiPo =
    tongshu.flags.includes('月破') || tongshu.flags.includes('歲破');
  if (yueSuiPo) {
    breakdown.push({
      source: 'tongshu',
      label: '月破／歲破 · 諸事不宜',
      delta: -30,
    });
    tongshuDelta -= 30;
  }

  // —— Astrology track ——
  if (isEarthMoonSign(astrology.moonSign)) {
    breakdown.push({
      source: 'astrology',
      label: `月亮在土象（${astrology.moonSign}）`,
      delta: 10,
    });
    astrologyDelta += 10;
  }

  const hasHarmMercJup = hasHarmoniousNatalAspect(astrology.aspectsToNatalSun, [
    'Mercury',
    'Jupiter',
  ]);
  if (hasHarmMercJup) {
    breakdown.push({
      source: 'astrology',
      label: '水星／木星與本命太陽和諧相位',
      delta: 10,
    });
    astrologyDelta += 10;
  }

  const warnings = [...astrology.warnings];
  if (astrology.mercuryRetrograde) {
    breakdown.push({
      source: 'astrology',
      label: '水星逆行',
      delta: -10,
    });
    astrologyDelta -= 10;
    if (!warnings.includes('水逆期間：考試注意審題、出行預留緩衝時間')) {
      warnings.push('水逆期間：考試注意審題、出行預留緩衝時間');
    }
  }

  const bestHours = pickBestHours(tongshu.daytimeHours);

  const intentItems = intentAdjustments(intent, {
    jianChu: tongshu.jianChu,
    mercuryRx: astrology.mercuryRetrograde,
    hasHarmMercJup,
    clashDay: tongshu.flags.includes('日沖本人'),
    yueSuiPo,
    bestHours,
  });
  breakdown.push(...intentItems);
  const intentDelta = intentItems.reduce((s, i) => s + i.delta, 0);

  // 50/50 presentation: each track's contribution around the shared base
  const tongshuScore = clamp(60 + tongshuDelta);
  const astrologyScore = clamp(60 + astrologyDelta);
  const score = clamp(60 + tongshuDelta + astrologyDelta + intentDelta);

  const hourText =
    bestHours.length > 0
      ? bestHours
          .slice(0, 3)
          .map((h) => `${h.branch}時(${h.clockRange}/${h.tianShen})`)
          .join('、')
      : '無明顯吉時';

  const summaryZh = [
    `${dateYmd}｜意圖：${INTENT_LABELS[intent]}｜綜合 ${score} 分`,
    `通書 ${tongshuScore}／占星 ${astrologyScore}｜日柱 ${tongshu.dayGanZhi}｜建除 ${tongshu.jianChu}｜${tongshu.huangHeiDao}${tongshu.shiErShen}`,
    `太陽 ${astrology.sunSign}／月亮 ${astrology.moonSign}${astrology.mercuryRetrograde ? '／水逆' : ''}`,
    `建議時段：${hourText}`,
    ...(tongshu.flags.length ? [`旗標：${tongshu.flags.join('、')}`] : []),
    ...(warnings.length ? [`提醒：${warnings.join('；')}`] : []),
  ].join('\n');

  return {
    date: dateYmd,
    intent,
    score,
    tongshuScore,
    astrologyScore,
    breakdown,
    flags: [...tongshu.flags],
    warnings,
    tongshu,
    astrology,
    bestHours,
    summaryZh,
  };
}

/** Score a contiguous window of HKT civil dates. */
export function scoreRange(
  startYmd: string,
  days: number,
  intent: Intent,
  profile: UserProfile,
  addDays: (ymd: string, n: number) => string,
): DailyScoreReport[] {
  const out: DailyScoreReport[] = [];
  for (let i = 0; i < days; i++) {
    const ymd = addDays(startYmd, i);
    out.push(scoreDay(ymd, intent, profile));
  }
  return out;
}

/** Top-N dates by score (descending). */
export function topDates(
  reports: DailyScoreReport[],
  n = 5,
  minScore = 0,
): DailyScoreReport[] {
  return [...reports]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, n);
}
