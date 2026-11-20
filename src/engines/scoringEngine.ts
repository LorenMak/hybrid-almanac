/**
 * Personalized hybrid scoring (通書 50% + 西洋占星 50% contribution model).
 *
 * Base 60, then apply Tongshu / Astrology deltas; intent filters adjust
 * priorities for each择日意圖. Clamp final score to 0–100.
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
import { analyzeDayWuxing } from '../utils/orthodoxWuxing.js';

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

function yiHas(yi: string[], ...keywords: string[]): boolean {
  return yi.some((item) => keywords.some((k) => item.includes(k)));
}

function jiHas(ji: string[], ...keywords: string[]): boolean {
  return ji.some((item) => keywords.some((k) => item.includes(k)));
}

type IntentCtx = {
  jianChu: string;
  mercuryRx: boolean;
  hasHarmMercJup: boolean;
  clashDay: boolean;
  yueSuiPo: boolean;
  bestHours: ShiChenHour[];
  yi: string[];
  ji: string[];
  huangDao: boolean;
};

function intentAdjustments(intent: Intent, ctx: IntentCtx): ScoreBreakdownItem[] {
  const items: ScoreBreakdownItem[] = [];
  const push = (label: string, delta: number) =>
    items.push({ source: 'intent', label, delta });

  // Shared hard stops
  if (ctx.yueSuiPo && intent !== 'GENERAL') {
    push('月破／歲破諸事不宜', -8);
  }

  switch (intent) {
    case 'EXAM':
      if (isFavorableJianChu(ctx.jianChu)) push('考試宜成開定執', 5);
      if (ctx.hasHarmMercJup) push('水星／木星和諧本命太陽（考試）', 5);
      if (ctx.mercuryRx) push('水逆不利考試審題', -5);
      if (ctx.clashDay || ctx.yueSuiPo) push('沖破之日不宜應試', -10);
      break;

    case 'DRIVING':
      if (isAdverseJianChu(ctx.jianChu)) push('破危閉不利出行', -8);
      if (ctx.mercuryRx) push('水逆出行需緩衝', -5);
      if (ctx.bestHours.some((h) => h.luck === '吉')) push('日間有吉時辰可出門', 5);
      if (ctx.yueSuiPo) push('月破／歲破諸事不宜出行', -10);
      if (yiHas(ctx.yi, '出行', '移徙')) push('通書宜出行', 5);
      break;

    case 'INTERVIEW':
      if (['成', '开', '開'].includes(ctx.jianChu)) push('成／開日利面試', 8);
      if (ctx.hasHarmMercJup) push('木星／水星和諧利表達', 5);
      if (ctx.clashDay) push('日沖本人不利面試', -12);
      break;

    case 'WEDDING':
      if (yiHas(ctx.yi, '嫁娶', '納采', '訂盟', '冠笄')) push('通書宜嫁娶', 12);
      if (jiHas(ctx.ji, '嫁娶')) push('通書忌嫁娶', -15);
      if (ctx.huangDao) push('黃道日利喜事', 6);
      if (['成', '开', '開', '定'].includes(ctx.jianChu)) push('成開定利婚禮', 5);
      if (ctx.clashDay || ctx.yueSuiPo) push('沖破之日不宜嫁娶', -15);
      break;

    case 'MOVE':
      if (yiHas(ctx.yi, '移徙', '入宅', '安香', '出火')) push('通書宜搬家入宅', 12);
      if (jiHas(ctx.ji, '移徙', '入宅')) push('通書忌入宅', -12);
      if (['成', '开', '開', '定', '执', '執'].includes(ctx.jianChu)) push('成開定執利遷居', 5);
      if (ctx.clashDay) push('日沖本人不利搬家', -12);
      break;

    case 'SIGNING':
      if (yiHas(ctx.yi, '交易', '立券', '納財', '開市')) push('通書宜簽約交易', 10);
      if (jiHas(ctx.ji, '交易', '立券', '開市')) push('通書忌立約', -10);
      if (ctx.hasHarmMercJup) push('水木和諧利契約溝通', 6);
      if (ctx.mercuryRx) push('水逆簽約宜再核條款', -8);
      break;

    case 'OPENING':
      if (yiHas(ctx.yi, '開市', '開業', '掛匾', '納財')) push('通書宜開市開業', 12);
      if (jiHas(ctx.ji, '開市', '開業')) push('通書忌開市', -12);
      if (['成', '开', '開'].includes(ctx.jianChu)) push('成／開日利開業', 8);
      if (ctx.huangDao) push('黃道日利開張', 5);
      if (ctx.yueSuiPo) push('月破／歲破不宜開業', -12);
      break;

    case 'MEDICAL':
      if (yiHas(ctx.yi, '療病', '求醫', '針刺')) push('通書宜求醫', 10);
      if (jiHas(ctx.ji, '療病', '針刺', '穿耳')) push('通書忌醫事', -10);
      if (isAdverseJianChu(ctx.jianChu)) push('破危閉宜慎醫療安排', -6);
      if (ctx.clashDay) push('日沖本人醫療宜再擇日', -8);
      break;

    case 'STUDY':
      if (yiHas(ctx.yi, '入學', '赴任', '會親友')) push('通書宜入學進修', 8);
      if (isFavorableJianChu(ctx.jianChu)) push('成開定執利求學', 5);
      if (ctx.hasHarmMercJup) push('水木和諧利學習表達', 8);
      if (ctx.mercuryRx) push('水逆期間學習宜放慢確認', -5);
      break;

    case 'TRAVEL':
      if (yiHas(ctx.yi, '出行', '移徙', '遠回')) push('通書宜出行遠行', 10);
      if (jiHas(ctx.ji, '出行')) push('通書忌出行', -12);
      if (ctx.bestHours.some((h) => h.luck === '吉')) push('日間有吉時可啟程', 5);
      if (ctx.mercuryRx) push('水逆遠行預留緩衝', -6);
      if (ctx.yueSuiPo) push('月破／歲破不宜遠行', -10);
      break;

    case 'INVESTMENT':
      if (yiHas(ctx.yi, '納財', '開市', '交易', '立券')) push('通書宜財作', 10);
      if (jiHas(ctx.ji, '納財', '開市', '交易')) push('通書忌財作', -10);
      if (ctx.hasHarmMercJup) push('木星／水星和諧利財運決策', 8);
      if (ctx.mercuryRx) push('水逆投資宜謹慎覆核', -8);
      if (['成', '开', '開', '定'].includes(ctx.jianChu)) push('成開定利決策', 4);
      break;

    case 'GENERAL':
    default:
      if (isFavorableJianChu(ctx.jianChu)) push('建除吉日（通用）', 5);
      if (ctx.huangDao) push('黃道日（通用）', 5);
      if (ctx.clashDay) push('日沖本人（通用慎用）', -10);
      if (ctx.yueSuiPo) push('月破／歲破（通用不宜）', -12);
      break;
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

  // 廣經堂取向：正統五行生旺休囚（二十八宿／雜煞不計分）
  const monthBranch = tongshu.fourPillars.month.slice(1);
  const wuxing = analyzeDayWuxing(tongshu.dayGanZhi, monthBranch || '');
  if (wuxing.scoreDelta !== 0) {
    breakdown.push({
      source: 'tongshu',
      label: `五行月令 · ${wuxing.label}`,
      delta: wuxing.scoreDelta,
    });
    tongshuDelta += wuxing.scoreDelta;
  }

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
  const huangDao =
    tongshu.huangHeiDao === '黃道' || tongshu.huangHeiDao === '黄道';

  const intentItems = intentAdjustments(intent, {
    jianChu: tongshu.jianChu,
    mercuryRx: astrology.mercuryRetrograde,
    hasHarmMercJup,
    clashDay: tongshu.flags.includes('日沖本人'),
    yueSuiPo,
    bestHours,
    yi: tongshu.yi,
    ji: tongshu.ji,
    huangDao,
  });
  breakdown.push(...intentItems);
  const intentDelta = intentItems.reduce((s, i) => s + i.delta, 0);

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

/** Score every civil day in a calendar month (HKT). */
export function scoreMonth(
  year: number,
  month: number,
  intent: Intent,
  profile: UserProfile,
): DailyScoreReport[] {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: DailyScoreReport[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push(scoreDay(ymd, intent, profile));
  }
  // silence unused start for clarity of month start
  void start;
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
