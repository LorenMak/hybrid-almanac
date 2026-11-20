/**
 * Chinese Tongshu / 通書 engine.
 *
 * Dual-track day switch notes:
 * - Four Pillars day pillar follows solar-term / 子初 (23:00) conventions
 *   as implemented by lunar-typescript (sect-aware Ganzhi).
 * - Civil filtering & ICS use HKT calendar dates (00:00 day switch).
 */

import { Solar } from 'lunar-typescript';
import type { ShiChenHour, TongshuDayReport } from '../types/almanac.js';
import { toTraditional, toTraditionalList } from '../utils/traditionalZh.js';
import {
  analyzeDayWuxing,
  filterOrthodoxXiongSha,
  mansionReferenceNote,
} from '../utils/orthodoxWuxing.js';
import type { UserProfile } from '../../config/userProfile.js';

const ORTHODOX_NOTE =
  '宜忌／神煞依正統陰陽五行（生剋制化、生旺休囚）；二十八宿僅紀曆參考；雜煞／俗例偏煞已過濾（廣經堂通勝取向）。';

/** Daytime focus branches: 辰巳午未申 (~07:00–16:59 HKT). */
export const DAYTIME_FOCUS_BRANCHES = ['辰', '巳', '午', '未', '申'] as const;

/** Clash pairs for 月破 / 歲破 (六沖). */
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

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

function formatClock(minHm: string, maxHm: string): string {
  return `${minHm}–${maxHm}`;
}

function hourStart(minHm: string): number {
  return Number(minHm.split(':')[0]);
}

function hourEnd(maxHm: string): number {
  return Number(maxHm.split(':')[0]);
}

/**
 * Build Tongshu day report for a civil HKT date (YYYY-MM-DD).
 * Hour pillar uses noon HKT so daytime 時柱 is representative.
 */
export function getTongshuDay(
  dateYmd: string,
  profile: UserProfile,
): TongshuDayReport {
  const { y, m, d } = parseYmd(dateYmd);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  // Noon HKT wall-clock for daytime hour pillar (四柱時柱)
  const solarNoon = Solar.fromYmdHms(y, m, d, 12, 0, 0);
  const lunarNoon = solarNoon.getLunar();
  const baZi = lunarNoon.getBaZi();

  const times = lunar.getTimes();
  const daytimeHours: ShiChenHour[] = [];

  for (const t of times) {
    const branch = t.getZhi();
    if (!DAYTIME_FOCUS_BRANCHES.includes(branch as (typeof DAYTIME_FOCUS_BRANCHES)[number])) {
      continue;
    }
    // Prefer the daytime 子…亥 slot (skip late-night duplicate 子 if present)
    const minHm = t.getMinHm();
    const maxHm = t.getMaxHm();
    const start = hourStart(minHm);
    if (start >= 23) continue;

    const luck = t.getTianShenLuck();
    const daoType = t.getTianShenType();
    const daoTrad = toTraditional(daoType);
    daytimeHours.push({
      branch,
      ganZhi: t.getGanZhi(),
      clockRange: formatClock(minHm, maxHm),
      startHour: start,
      endHour: hourEnd(maxHm),
      tianShen: toTraditional(t.getTianShen()),
      daoType: daoTrad,
      luck: toTraditional(luck),
      yi: toTraditionalList(t.getYi()),
      ji: toTraditionalList(t.getJi()),
      isDaytimeFocus: true,
      isAuspicious: luck === '吉' || daoTrad === '黃道',
    });
  }

  // Deduplicate by branch (library returns 13 slots with two 子)
  const seen = new Set<string>();
  const uniqueHours = daytimeHours.filter((h) => {
    if (seen.has(h.branch)) return false;
    seen.add(h.branch);
    return true;
  });

  const dayBranch = lunar.getDayZhi();
  const monthBranch = lunar.getMonthZhi();
  const yearBranch = lunar.getYearZhi();
  const flags: string[] = [];

  if (dayBranch === profile.clashBranch) {
    flags.push('日沖本人');
  }
  if (CLASH_PAIR[dayBranch] === monthBranch) {
    flags.push('月破');
    flags.push('諸事不宜');
  }
  if (CLASH_PAIR[dayBranch] === yearBranch) {
    flags.push('歲破');
    if (!flags.includes('諸事不宜')) flags.push('諸事不宜');
  }

  const jieQiName = lunar.getJieQi() || null;
  const lunarSummary = `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;

  const rawSha = toTraditionalList(lunar.getDayXiongSha());
  const { core, folkFiltered } = filterOrthodoxXiongSha(rawSha);
  const dayGanZhi = lunar.getDayInGanZhi();
  const wuxing = analyzeDayWuxing(dayGanZhi, monthBranch);
  const xiu = toTraditional(lunar.getXiu());
  const xiuLuck = toTraditional(lunar.getXiuLuck());

  return {
    date: dateYmd,
    solarYmd: solar.toYmd(),
    lunarSummary: toTraditional(lunarSummary),
    fourPillars: {
      year: baZi[0] ?? '',
      month: baZi[1] ?? '',
      day: baZi[2] ?? '',
      hour: baZi[3] ?? '',
    },
    dayGanZhi,
    dayBranch,
    jianChu: toTraditional(lunar.getZhiXing()),
    shiErShen: toTraditional(lunar.getDayTianShen()),
    huangHeiDao: toTraditional(lunar.getDayTianShenType()),
    shiErShenLuck: toTraditional(lunar.getDayTianShenLuck()),
    yi: toTraditionalList(lunar.getDayYi()),
    ji: toTraditionalList(lunar.getDayJi()),
    jiShen: toTraditionalList(lunar.getDayJiShen()),
    xiongSha: core,
    folkShaFiltered: folkFiltered,
    xiu,
    xiuLuck,
    xiuNote: mansionReferenceNote(xiu, xiuLuck),
    wuxing: {
      dayStemElement: wuxing.dayStemElement,
      seasonElement: wuxing.seasonElement,
      wangLevel: wuxing.wangLevel,
      label: wuxing.label,
    },
    jieQi: jieQiName ? toTraditional(jieQiName) : null,
    daytimeHours: uniqueHours,
    flags,
    orthodoxNote: ORTHODOX_NOTE,
  };
}

/** True when 建除 is among auspicious 成開定執. */
export function isFavorableJianChu(jianChu: string): boolean {
  return ['成', '开', '開', '定', '执', '執'].includes(jianChu);
}

/** True when 建除 is among inauspicious 破危閉. */
export function isAdverseJianChu(jianChu: string): boolean {
  return ['破', '危', '闭', '閉'].includes(jianChu);
}
