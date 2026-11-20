/**
 * ICS calendar exporter + optional LLM polish stub.
 * Exports dates with score ≥ threshold for a selected intent.
 */

import { createEvents, type EventAttributes } from 'ics';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DailyScoreReport, LlmPolishHook } from '../types/almanac.js';
import { INTENT_LABELS, type Intent } from '../../config/userProfile.js';

/** Stub LLM polish hook — replace with a real provider later (no paid API required). */
export class StubLlmPolish implements LlmPolishHook {
  async polishDailyBrief(json: DailyScoreReport): Promise<string> {
    const hours = json.bestHours
      .slice(0, 2)
      .map((h) => `${h.branch}（${h.clockRange}）`)
      .join('、');
    return [
      `【${INTENT_LABELS[json.intent]}擇日】${json.date}　${json.score}分`,
      `通書：${json.tongshu.dayGanZhi}／${json.tongshu.jianChu}／${json.tongshu.shiErShen}`,
      `占星：日${json.astrology.sunSign}　月${json.astrology.moonSign}`,
      hours ? `吉時：${hours}` : '',
    ]
      .filter(Boolean)
      .join('｜');
  }
}

function ymdToIcsDate(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y!, m!, d!];
}

function buildEventDescription(r: DailyScoreReport): string {
  const lines = [
    r.summaryZh,
    '',
    `四柱：${r.tongshu.fourPillars.year} ${r.tongshu.fourPillars.month} ${r.tongshu.fourPillars.day} ${r.tongshu.fourPillars.hour}`,
    `宜：${r.tongshu.yi.slice(0, 8).join('、') || '—'}`,
    `忌：${r.tongshu.ji.slice(0, 8).join('、') || '—'}`,
    `吉神：${r.tongshu.jiShen.join('、') || '—'}`,
    `凶煞：${r.tongshu.xiongSha.join('、') || '—'}`,
    `相位：${
      r.astrology.aspectsToNatalSun
        .map((a) => `${a.body}-${a.kind}(${a.quality})`)
        .join('、') || '無'
    }`,
  ];
  if (r.bestHours.length) {
    lines.push(
      `日間吉時：${r.bestHours
        .map((h) => `${h.branch}${h.clockRange}/${h.tianShen}/${h.luck}`)
        .join('；')}`,
    );
  }
  return lines.join('\n');
}

async function reportToEvent(
  r: DailyScoreReport,
  polish: LlmPolishHook,
): Promise<EventAttributes> {
  const brief = await polish.polishDailyBrief(r);
  const best = r.bestHours[0];
  const title = `【${INTENT_LABELS[r.intent]}】${r.score}分｜${r.tongshu.jianChu}${r.tongshu.shiErShen}`;
  const description = `${brief}\n\n${buildEventDescription(r)}`;

  if (best) {
    return {
      title,
      description,
      start: [...ymdToIcsDate(r.date), best.startHour, 0],
      end: [...ymdToIcsDate(r.date), Math.min(best.endHour + 1, 23), 59],
      calName: 'Hybrid Almanac 中西擇日',
      productId: 'hybrid-almanac/ics',
      status: 'CONFIRMED',
      busyStatus: 'FREE',
      startInputType: 'local',
      startOutputType: 'local',
    };
  }

  return {
    title,
    description,
    start: ymdToIcsDate(r.date),
    end: ymdToIcsDate(r.date),
    calName: 'Hybrid Almanac 中西擇日',
    productId: 'hybrid-almanac/ics',
    status: 'CONFIRMED',
    busyStatus: 'FREE',
  };
}

/**
 * Build Traditional Chinese ICS events for high-scoring dates.
 * Default: score ≥ 80.
 */
export async function buildIcsEvents(
  reports: DailyScoreReport[],
  intent: Intent | 'ALL',
  options: {
    minScore?: number;
    polish?: LlmPolishHook;
  } = {},
): Promise<EventAttributes[]> {
  const minScore = options.minScore ?? 80;
  const polish = options.polish ?? new StubLlmPolish();
  const selected = reports.filter(
    (r) => (intent === 'ALL' || r.intent === intent) && r.score >= minScore,
  );

  // Deduplicate same date+intent
  const seen = new Set<string>();
  const unique = selected.filter((r) => {
    const key = `${r.date}:${r.intent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const events: EventAttributes[] = [];
  for (const r of unique) {
    events.push(await reportToEvent(r, polish));
  }
  return events;
}

/** Write auspicious dates to an .ics file. Returns absolute path written. */
export async function exportAuspiciousIcs(
  reports: DailyScoreReport[],
  intent: Intent | 'ALL',
  outputPath: string,
  options: {
    minScore?: number;
    polish?: LlmPolishHook;
  } = {},
): Promise<{ path: string; count: number; value: string }> {
  const events = await buildIcsEvents(reports, intent, options);
  if (events.length === 0) {
    const emptyNote: EventAttributes = {
      title: `【擇日】暫無≥${options.minScore ?? 80}分吉日`,
      description: '在選定視窗內沒有達到門檻的日期；可降低 minScore 或擴大搜尋天數。',
      start: ymdToIcsDate(reports[0]?.date ?? '2026-01-01'),
      end: ymdToIcsDate(reports[0]?.date ?? '2026-01-01'),
      calName: 'Hybrid Almanac 中西擇日',
      productId: 'hybrid-almanac/ics',
      status: 'TENTATIVE',
      busyStatus: 'FREE',
    };
    events.push(emptyNote);
  }

  const { error, value } = createEvents(events);
  if (error || !value) {
    throw error ?? new Error('ics createEvents returned empty value');
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, value, 'utf8');
  return {
    path: outputPath,
    count: events.length,
    value,
  };
}

/**
 * Optional hook entry: polish daily JSON → short Traditional Chinese brief.
 * Exposed for callers who want to swap in a real LLM later.
 */
export async function polishDailyJson(
  report: DailyScoreReport,
  hook: LlmPolishHook = new StubLlmPolish(),
): Promise<string> {
  return hook.polishDailyBrief(report);
}
