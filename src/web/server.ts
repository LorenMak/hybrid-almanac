/**
 * Lightweight local dashboard — Express + inline Tailwind CDN.
 * Daily reports + auspicious-date filtering by intent / min score.
 */

import express from 'express';
import { resolve } from 'node:path';
import { DEFAULT_USER_PROFILE, INTENT_LABELS, type Intent } from '../../config/userProfile.js';
import { scoreDay, scoreRange } from '../engines/scoringEngine.js';
import { exportAuspiciousIcs } from '../exporters/icsExporter.js';
import { addDaysYmd, todayHktYmd } from '../utils/astronomyCore.js';

const PORT = Number(process.env.PORT ?? 3456);
const app = express();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, profile: DEFAULT_USER_PROFILE.birthDate });
});

app.get('/api/day/:ymd', (req, res) => {
  const intent = ((req.query.intent as string) || 'EXAM').toUpperCase() as Intent;
  if (!['EXAM', 'DRIVING', 'INTERVIEW'].includes(intent)) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  const report = scoreDay(req.params.ymd!, intent, DEFAULT_USER_PROFILE);
  res.json(report);
});

app.get('/api/range', (req, res) => {
  const intent = ((req.query.intent as string) || 'EXAM').toUpperCase() as Intent;
  const days = Math.min(120, Math.max(1, Number(req.query.days ?? 60)));
  const minScore = Number(req.query.minScore ?? 0);
  const start = (req.query.start as string) || todayHktYmd();
  if (!['EXAM', 'DRIVING', 'INTERVIEW'].includes(intent)) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  const all = scoreRange(start, days, intent, DEFAULT_USER_PROFILE, addDaysYmd);
  const filtered = all.filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score);
  res.json({ start, days, intent, count: filtered.length, results: filtered });
});

app.post('/api/export-ics', async (req, res) => {
  const intent = ((req.body?.intent as string) || 'EXAM').toUpperCase() as Intent;
  const days = Math.min(120, Math.max(1, Number(req.body?.days ?? 60)));
  const minScore = Number(req.body?.minScore ?? 80);
  const start = (req.body?.start as string) || todayHktYmd();
  if (!['EXAM', 'DRIVING', 'INTERVIEW'].includes(intent)) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  const all = scoreRange(start, days, intent, DEFAULT_USER_PROFILE, addDaysYmd);
  const out = resolve(`output/auspicious_dates_${intent.toLowerCase()}.ics`);
  const result = await exportAuspiciousIcs(all, intent, out, { minScore });
  res.json(result);
});

app.get('/', (_req, res) => {
  res.type('html').send(dashboardHtml());
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Hybrid Almanac dashboard → http://127.0.0.1:${PORT}`);
});

function dashboardHtml(): string {
  const intents = (Object.keys(INTENT_LABELS) as Intent[])
    .map((k) => `<option value="${k}">${k} · ${INTENT_LABELS[k]}</option>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>中西雙曆法擇日</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=DM+Sans:wght@400;600&display=swap');
    :root { --ink:#1c1917; --paper:#f7f3eb; --jade:#0f766e; --clay:#b45309; }
    body { font-family:'DM Sans',system-ui,sans-serif; background:
      radial-gradient(ellipse at 20% 0%, #dde8e4 0%, transparent 50%),
      radial-gradient(ellipse at 90% 10%, #f0e2d0 0%, transparent 45%),
      var(--paper); color:var(--ink); }
    h1,h2 { font-family:'Noto Serif TC',serif; }
  </style>
</head>
<body class="min-h-screen">
  <main class="max-w-5xl mx-auto px-4 py-10">
    <header class="mb-10">
      <p class="text-sm tracking-[0.2em] uppercase text-teal-800/70 mb-2">Hybrid Almanac</p>
      <h1 class="text-4xl md:text-5xl font-bold text-stone-900">中西雙曆法個人運程與擇日</h1>
      <p class="mt-3 text-stone-600 max-w-2xl">通書建除／十二神 × 西洋黃道經度與相位。預設命盤：2004-05-19 香港（申日 · 太陽金牛 ≈58°）。</p>
    </header>

    <section class="flex flex-wrap gap-3 items-end mb-8">
      <label class="flex flex-col text-sm gap-1">意圖
        <select id="intent" class="rounded-md border border-stone-300 bg-white/80 px-3 py-2">${intents}</select>
      </label>
      <label class="flex flex-col text-sm gap-1">天數
        <input id="days" type="number" value="60" min="1" max="120" class="rounded-md border border-stone-300 bg-white/80 px-3 py-2 w-24" />
      </label>
      <label class="flex flex-col text-sm gap-1">最低分數
        <input id="minScore" type="number" value="70" min="0" max="100" class="rounded-md border border-stone-300 bg-white/80 px-3 py-2 w-24" />
      </label>
      <button id="run" class="rounded-md bg-teal-800 text-white px-5 py-2.5 font-semibold hover:bg-teal-700">掃描</button>
      <button id="export" class="rounded-md border border-teal-800 text-teal-900 px-5 py-2.5 font-semibold hover:bg-teal-50">匯出 ICS</button>
    </section>

    <p id="status" class="text-sm text-stone-500 mb-4"></p>
    <div id="results" class="space-y-4"></div>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    async function scan() {
      const intent = $('intent').value;
      const days = $('days').value;
      const minScore = $('minScore').value;
      $('status').textContent = '計算中…';
      const res = await fetch('/api/range?intent=' + intent + '&days=' + days + '&minScore=' + minScore);
      const data = await res.json();
      $('status').textContent = '共 ' + data.count + ' 日符合條件（' + data.start + ' 起 ' + data.days + ' 日）';
      $('results').innerHTML = data.results.slice(0, 20).map((r) => {
        const hours = (r.bestHours || []).slice(0, 3).map(h => h.branch + ' ' + h.clockRange).join(' · ') || '—';
        return '<article class="rounded-xl border border-stone-200/80 bg-white/70 backdrop-blur px-5 py-4">'
          + '<div class="flex flex-wrap justify-between gap-2 items-baseline">'
          + '<h2 class="text-xl font-bold">' + r.date + ' <span class="text-teal-800">' + r.score + ' 分</span></h2>'
          + '<span class="text-sm text-stone-500">通書 ' + r.tongshuScore + ' / 占星 ' + r.astrologyScore + '</span></div>'
          + '<p class="mt-2 text-sm">' + r.tongshu.dayGanZhi + ' · 建除' + r.tongshu.jianChu + ' · '
          + r.tongshu.shiErShen + '（' + r.tongshu.huangHeiDao + '） · 日' + r.astrology.sunSign
          + ' / 月' + r.astrology.moonSign + (r.astrology.mercuryRetrograde ? ' · 水逆' : '') + '</p>'
          + '<p class="mt-1 text-sm text-stone-600">吉時：' + hours + '</p>'
          + (r.flags.length ? '<p class="mt-1 text-sm text-amber-800">旗標：' + r.flags.join('、') + '</p>' : '')
          + (r.warnings.length ? '<p class="mt-1 text-sm text-rose-800">' + r.warnings.join('；') + '</p>' : '')
          + '</article>';
      }).join('') || '<p class="text-stone-500">沒有符合條件的日期。</p>';
    }
    $('run').onclick = scan;
    $('export').onclick = async () => {
      const body = {
        intent: $('intent').value,
        days: Number($('days').value),
        minScore: Number($('minScore').value) || 80,
      };
      const res = await fetch('/api/export-ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      $('status').textContent = '已匯出 ' + data.count + ' 筆 → ' + data.path;
    };
    scan();
  </script>
</body>
</html>`;
}
