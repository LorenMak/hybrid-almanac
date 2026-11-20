/**
 * CLI runner — next 60 days for EXAM & DRIVING.
 * Prints top 5 each with full Tongshu + Horoscope breakdown; writes .ics.
 */

import { resolve } from 'node:path';
import { DEFAULT_USER_PROFILE, type Intent } from '../config/userProfile.js';
import { scoreRange, topDates } from './engines/scoringEngine.js';
import { exportAuspiciousIcs } from './exporters/icsExporter.js';
import { addDaysYmd, todayHktYmd } from './utils/astronomyCore.js';
import type { DailyScoreReport } from './types/almanac.js';

const DAYS = 60;
const TOP_N = 5;
const ICS_MIN_SCORE = 80;

function printReport(r: DailyScoreReport, rank: number): void {
  const t = r.tongshu;
  const a = r.astrology;
  console.log('\n' + '═'.repeat(64));
  console.log(
    `#${rank}  ${r.date}  │  ${r.score} 分  （通書 ${r.tongshuScore} / 占星 ${r.astrologyScore}）`,
  );
  console.log('─'.repeat(64));
  console.log(`【通書 Tongshu】`);
  console.log(`  農曆：${t.lunarSummary}`);
  console.log(
    `  四柱：${t.fourPillars.year}年 ${t.fourPillars.month}月 ${t.fourPillars.day}日 ${t.fourPillars.hour}時`,
  );
  console.log(
    `  日柱 ${t.dayGanZhi}｜建除 ${t.jianChu}｜十二神 ${t.shiErShen}（${t.huangHeiDao}/${t.shiErShenLuck}）`,
  );
  if (t.jieQi) console.log(`  節氣：${t.jieQi}`);
  console.log(`  宜：${t.yi.slice(0, 10).join('、') || '—'}`);
  console.log(`  忌：${t.ji.slice(0, 10).join('、') || '—'}`);
  console.log(
    `  吉神：${t.jiShen.join('、') || '—'}｜凶煞：${t.xiongSha.join('、') || '—'}`,
  );
  if (t.flags.length) console.log(`  旗標：${t.flags.join('、')}`);
  console.log(
    `  日間時辰：${
      t.daytimeHours
        .map((h) => `${h.branch}${h.clockRange} ${h.tianShen}/${h.luck}`)
        .join('；') || '—'
    }`,
  );
  console.log(`【西洋 Horoscope】`);
  console.log(
    `  日 ${a.sunSign} (${a.longitudes.sun.toFixed(1)}°)｜月 ${a.moonSign} (${a.longitudes.moon.toFixed(1)}°)`,
  );
  console.log(
    `  水 ${a.longitudes.mercury.toFixed(1)}°｜金 ${a.longitudes.venus.toFixed(1)}°｜火 ${a.longitudes.mars.toFixed(1)}°｜木 ${a.longitudes.jupiter.toFixed(1)}°`,
  );
  console.log(
    `  水星：${a.mercuryRetrograde ? '逆行' : '順行'}（Δ ${a.mercuryDelta.toFixed(3)}°/日）｜月相角 ${a.moonPhaseDegrees.toFixed(1)}°`,
  );
  console.log(
    `  本命太陽相位：${
      a.aspectsToNatalSun
        .map((x) => `${x.body} ${x.kind}/${x.quality} orb ${x.orb.toFixed(1)}°`)
        .join('；') || '無'
    }`,
  );
  console.log(`  考試：${a.insights.exam.join('；')}`);
  console.log(`  出行：${a.insights.driving.join('；')}`);
  console.log(`  專注：${a.insights.focus.join('；')}`);
  if (r.warnings.length) console.log(`  ⚠ ${r.warnings.join('；')}`);
  console.log(
    `  評分明細：${r.breakdown
      .map((b) => `${b.label}${b.delta >= 0 ? '+' : ''}${b.delta}`)
      .join('，')}`,
  );
  console.log(
    `  建議時段：${
      r.bestHours.map((h) => `${h.branch}(${h.clockRange}/${h.tianShen})`).join('、') ||
      '—'
    }`,
  );
}

async function runIntent(
  intent: Intent,
  start: string,
  profile = DEFAULT_USER_PROFILE,
): Promise<{ top: DailyScoreReport[]; all: DailyScoreReport[]; icsPath: string }> {
  const all = scoreRange(start, DAYS, intent, profile, addDaysYmd);
  const top = topDates(all, TOP_N, 0);

  console.log('\n' + '█'.repeat(64));
  console.log(`意圖 ${intent}｜自 ${start} 起 ${DAYS} 日｜Top ${TOP_N}`);
  console.log('█'.repeat(64));
  top.forEach((r, i) => printReport(r, i + 1));

  const icsPath = resolve(`output/auspicious_dates_${intent.toLowerCase()}.ics`);
  const { path, count } = await exportAuspiciousIcs(all, intent, icsPath, {
    minScore: ICS_MIN_SCORE,
  });
  console.log(`\n→ ICS 已寫入 ${path}（${count} 筆，門檻 ≥${ICS_MIN_SCORE}）`);

  return { top, all, icsPath: path };
}

async function main(): Promise<void> {
  const start = todayHktYmd();
  console.log('中西雙曆法個人運程與擇日系統');
  console.log(
    `Profile: 出生 ${DEFAULT_USER_PROFILE.birthDate} HKT｜日支 ${DEFAULT_USER_PROFILE.chineseBranch}｜本命太陽 ${DEFAULT_USER_PROFILE.natalSunLongitude}° ${DEFAULT_USER_PROFILE.natalSunSign}`,
  );
  console.log(`掃描起點（HKT）：${start}`);

  const exam = await runIntent('EXAM', start);
  const driving = await runIntent('DRIVING', start);

  const combinedPath = resolve('output/auspicious_dates.ics');
  const { count } = await exportAuspiciousIcs(
    [...exam.all, ...driving.all],
    'ALL',
    combinedPath,
    { minScore: ICS_MIN_SCORE },
  );

  console.log('\n' + '═'.repeat(64));
  console.log('摘要 Summary');
  console.log('─'.repeat(64));
  console.log(
    'EXAM Top:',
    exam.top.map((r) => `${r.date}(${r.score})`).join(', ') || '(none)',
  );
  console.log(
    'DRIVING Top:',
    driving.top.map((r) => `${r.date}(${r.score})`).join(', ') || '(none)',
  );
  console.log(`Canonical ICS: ${combinedPath}（${count} 筆）`);
  console.log(`Also: ${exam.icsPath}`);
  console.log(`Also: ${driving.icsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
