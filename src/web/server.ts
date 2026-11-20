/**
 * Lightweight local dashboard — Express + Tailwind CDN.
 * 紅金傳統風格介面；可輸入星座／生肖／出生年月日輔助擇日。
 */

import express from 'express';
import { resolve } from 'node:path';
import {
  DEFAULT_USER_PROFILE,
  INTENT_LABELS,
  type Intent,
  type UserProfile,
} from '../../config/userProfile.js';
import { scoreDay, scoreRange } from '../engines/scoringEngine.js';
import { exportAuspiciousIcs } from '../exporters/icsExporter.js';
import { addDaysYmd, todayHktYmd } from '../utils/astronomyCore.js';
import {
  BRANCH_TO_ZODIAC,
  buildProfileFromInput,
  CHINESE_ZODIAC_LIST,
  suggestFromBirthDate,
  WESTERN_SIGN_LABELS,
  type ProfileInput,
} from '../utils/profileBuilder.js';
import { SIGN_NAMES } from '../utils/astronomyCore.js';

const PORT = Number(process.env.PORT ?? 3456);
const app = express();

app.use(express.json());

function parseIntent(raw: unknown): Intent | null {
  const intent = String(raw ?? 'EXAM').toUpperCase() as Intent;
  return ['EXAM', 'DRIVING', 'INTERVIEW'].includes(intent) ? intent : null;
}

function resolveProfile(bodyOrQuery: {
  birthDate?: string;
  westernSign?: string;
  chineseZodiac?: string;
  useDayBranch?: boolean | string;
}): { profile: UserProfile; meta?: ReturnType<typeof buildProfileFromInput> } {
  if (bodyOrQuery.birthDate) {
    const meta = buildProfileFromInput({
      birthDate: bodyOrQuery.birthDate,
      westernSign: bodyOrQuery.westernSign,
      chineseZodiac: bodyOrQuery.chineseZodiac,
      useDayBranch:
        bodyOrQuery.useDayBranch === true || bodyOrQuery.useDayBranch === 'true',
    });
    return { profile: meta.profile, meta };
  }
  return { profile: DEFAULT_USER_PROFILE };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, profile: DEFAULT_USER_PROFILE.birthDate });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    westernSigns: SIGN_NAMES.map((s) => ({ id: s, label: WESTERN_SIGN_LABELS[s] })),
    chineseZodiacs: CHINESE_ZODIAC_LIST.map((z) => ({ id: z, label: z })),
    intents: (Object.keys(INTENT_LABELS) as Intent[]).map((k) => ({
      id: k,
      label: INTENT_LABELS[k],
    })),
    defaultProfile: {
      birthDate: DEFAULT_USER_PROFILE.birthDate,
      westernSign: DEFAULT_USER_PROFILE.natalSunSign,
      chineseZodiac: BRANCH_TO_ZODIAC[DEFAULT_USER_PROFILE.chineseBranch] ?? '猴',
    },
  });
});

app.get('/api/suggest', (req, res) => {
  try {
    const birthDate = String(req.query.birthDate ?? '');
    res.json(suggestFromBirthDate(birthDate));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'invalid date' });
  }
});

app.post('/api/profile', (req, res) => {
  try {
    const meta = buildProfileFromInput(req.body as ProfileInput);
    res.json(meta);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'invalid profile' });
  }
});

app.get('/api/day/:ymd', (req, res) => {
  const intent = parseIntent(req.query.intent);
  if (!intent) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  try {
    const { profile } = resolveProfile({
      birthDate: req.query.birthDate as string | undefined,
      westernSign: req.query.westernSign as string | undefined,
      chineseZodiac: req.query.chineseZodiac as string | undefined,
      useDayBranch: req.query.useDayBranch as string | undefined,
    });
    res.json(scoreDay(req.params.ymd!, intent, profile));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
  }
});

app.post('/api/range', (req, res) => {
  const intent = parseIntent(req.body?.intent);
  if (!intent) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  try {
    const days = Math.min(120, Math.max(1, Number(req.body?.days ?? 60)));
    const minScore = Number(req.body?.minScore ?? 0);
    const start = (req.body?.start as string) || todayHktYmd();
    const { profile, meta } = resolveProfile(req.body ?? {});
    const all = scoreRange(start, days, intent, profile, addDaysYmd);
    const filtered = all
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);
    res.json({
      start,
      days,
      intent,
      count: filtered.length,
      results: filtered,
      profile: meta
        ? {
            birthDate: profile.birthDate,
            chineseBranch: profile.chineseBranch,
            chineseZodiac: meta.chineseZodiac,
            westernSign: profile.natalSunSign,
            westernSignZh: meta.westernSignZh,
            natalSunLongitude: profile.natalSunLongitude,
            favorableBranches: profile.favorableBranches,
            clashBranch: profile.clashBranch,
            notes: meta.notes,
          }
        : {
            birthDate: profile.birthDate,
            chineseBranch: profile.chineseBranch,
            westernSign: profile.natalSunSign,
            natalSunLongitude: profile.natalSunLongitude,
            favorableBranches: profile.favorableBranches,
            clashBranch: profile.clashBranch,
          },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
  }
});

/** Keep GET /api/range for backward compatibility (default profile). */
app.get('/api/range', (req, res) => {
  const intent = parseIntent(req.query.intent);
  if (!intent) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  try {
    const days = Math.min(120, Math.max(1, Number(req.query.days ?? 60)));
    const minScore = Number(req.query.minScore ?? 0);
    const start = (req.query.start as string) || todayHktYmd();
    const { profile, meta } = resolveProfile({
      birthDate: req.query.birthDate as string | undefined,
      westernSign: req.query.westernSign as string | undefined,
      chineseZodiac: req.query.chineseZodiac as string | undefined,
      useDayBranch: req.query.useDayBranch as string | undefined,
    });
    const all = scoreRange(start, days, intent, profile, addDaysYmd);
    const filtered = all
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);
    res.json({
      start,
      days,
      intent,
      count: filtered.length,
      results: filtered,
      profileSummary: meta?.chineseZodiac,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
  }
});

app.post('/api/export-ics', async (req, res) => {
  const intent = parseIntent(req.body?.intent);
  if (!intent) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  try {
    const days = Math.min(120, Math.max(1, Number(req.body?.days ?? 60)));
    const minScore = Number(req.body?.minScore ?? 80);
    const start = (req.body?.start as string) || todayHktYmd();
    const { profile } = resolveProfile(req.body ?? {});
    const all = scoreRange(start, days, intent, profile, addDaysYmd);
    const out = resolve(`output/auspicious_dates_${intent.toLowerCase()}.ics`);
    const result = await exportAuspiciousIcs(all, intent, out, { minScore });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
  }
});

app.get('/', (_req, res) => {
  res.type('html').send(dashboardHtml());
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Hybrid Almanac dashboard → http://127.0.0.1:${PORT}`);
});

function dashboardHtml(): string {
  const westernOpts = SIGN_NAMES.map(
    (s) => `<option value="${s}">${WESTERN_SIGN_LABELS[s]} · ${s}</option>`,
  ).join('');
  const zodiacOpts = CHINESE_ZODIAC_LIST.map(
    (z) => `<option value="${z}">${z}</option>`,
  ).join('');
  const intents = (Object.keys(INTENT_LABELS) as Intent[])
    .map((k) => `<option value="${k}">${INTENT_LABELS[k]}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>紅金擇日 · 中西雙曆法</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=ZCOOL+XiaoWei&display=swap');
    :root {
      --cinnabar: #8f1414;
      --cinnabar-deep: #5c0a0a;
      --lacquer: #b91c1c;
      --gold: #d4af37;
      --gold-bright: #f0d78c;
      --gold-dim: #a68523;
      --ink: #1a0808;
      --paper-gold: #fff6e0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Noto Serif TC', 'ZCOOL XiaoWei', serif;
      color: var(--paper-gold);
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(240,215,140,0.28), transparent 55%),
        radial-gradient(ellipse 60% 40% at 100% 30%, rgba(212,175,55,0.12), transparent 50%),
        radial-gradient(ellipse 50% 35% at 0% 80%, rgba(185,28,28,0.55), transparent 45%),
        linear-gradient(165deg, var(--cinnabar-deep) 0%, var(--cinnabar) 42%, #7a1010 78%, #4a0808 100%);
      background-attachment: fixed;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.07;
      background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='%23d4af37' stroke-width='0.6'/%3E%3C/svg%3E");
    }
    h1, h2, .brand { font-family: 'ZCOOL XiaoWei', 'Noto Serif TC', serif; }
    .gold-text {
      background: linear-gradient(120deg, #fff1c1 0%, var(--gold) 40%, #fff6e0 55%, var(--gold-bright) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .gold-rule {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      border: 0;
    }
    .panel {
      background: linear-gradient(145deg, rgba(92,10,10,0.72), rgba(122,16,16,0.55));
      border: 1px solid rgba(212,175,55,0.45);
      box-shadow: 0 0 0 1px rgba(240,215,140,0.12), 0 18px 40px rgba(0,0,0,0.35);
      backdrop-filter: blur(6px);
    }
    .field {
      background: rgba(26,8,8,0.45);
      border: 1px solid rgba(212,175,55,0.35);
      color: var(--paper-gold);
      border-radius: 0.35rem;
      padding: 0.55rem 0.75rem;
      width: 100%;
    }
    .field:focus {
      outline: none;
      border-color: var(--gold-bright);
      box-shadow: 0 0 0 2px rgba(212,175,55,0.25);
    }
    .field option { background: #5c0a0a; color: #fff6e0; }
    .btn-gold {
      background: linear-gradient(180deg, #f0d78c 0%, #d4af37 48%, #a68523 100%);
      color: #4a0808;
      font-weight: 700;
      border: 1px solid #fff1c1;
      border-radius: 0.35rem;
      padding: 0.65rem 1.35rem;
      letter-spacing: 0.08em;
      transition: transform 0.15s ease, filter 0.15s ease;
    }
    .btn-gold:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .btn-outline {
      background: transparent;
      color: var(--gold-bright);
      border: 1px solid rgba(212,175,55,0.65);
      border-radius: 0.35rem;
      padding: 0.65rem 1.2rem;
      font-weight: 600;
    }
    .btn-outline:hover { background: rgba(212,175,55,0.12); }
    .result-row {
      border-bottom: 1px solid rgba(212,175,55,0.2);
      padding: 1rem 0;
      animation: rise 0.45s ease both;
    }
    .result-row:last-child { border-bottom: 0; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    .brand-glow {
      background-size: 200% auto;
      animation: shimmer 6s linear infinite;
    }
    label .hint { color: rgba(240,215,140,0.65); font-size: 0.75rem; }
  </style>
</head>
<body>
  <main class="relative max-w-5xl mx-auto px-4 py-10 md:py-14">
    <header class="mb-10 text-center md:text-left">
      <p class="brand tracking-[0.35em] text-sm text-[color:var(--gold-bright)] mb-3">紅金擇日 · HYBRID ALMANAC</p>
      <h1 class="text-4xl md:text-6xl font-black leading-tight brand-glow gold-text">中西雙曆法<br class="md:hidden" />個人運程與擇日</h1>
      <p class="mt-4 max-w-2xl mx-auto md:mx-0 text-[color:var(--gold-bright)]/85 text-base md:text-lg">
        輸入您的<strong class="text-[color:var(--gold)]">出生年月日</strong>、<strong class="text-[color:var(--gold)]">西洋星座</strong>與<strong class="text-[color:var(--gold)]">生肖</strong>，系統以通書建除／十二神與黃道相位，為您篩選吉日吉時。
      </p>
      <hr class="gold-rule mt-8" />
    </header>

    <section class="panel rounded-lg p-5 md:p-7 mb-8" aria-label="個人命盤">
      <h2 class="text-2xl gold-text mb-1">個人命盤</h2>
      <p class="text-sm text-[color:var(--gold-bright)]/70 mb-5">填寫後即可掃描吉日；留空星座／生肖時，會依出生日自動推算。</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label class="flex flex-col gap-1.5 text-sm">出生年月日
          <input id="birthDate" type="date" class="field" value="2004-05-19" />
          <span class="hint">香港時區推算太陽與農曆年</span>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">西洋星座
          <select id="westernSign" class="field">
            <option value="">自動推算</option>
            ${westernOpts}
          </select>
          <span class="hint">可手動覆寫</span>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">生肖
          <select id="chineseZodiac" class="field">
            <option value="">自動推算（農曆年）</option>
            ${zodiacOpts}
          </select>
          <span class="hint">用於日沖／喜用支</span>
        </label>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-4">
        <label class="inline-flex items-center gap-2 text-sm text-[color:var(--gold-bright)]/90 cursor-pointer">
          <input id="useDayBranch" type="checkbox" class="accent-[color:var(--gold)]" />
          改用出生日柱地支（進階）
        </label>
        <button type="button" id="autofill" class="btn-outline text-sm py-2 px-3">依生日自動填入星座／生肖</button>
      </div>
      <p id="profileHint" class="mt-4 text-sm text-[color:var(--gold-bright)]/80 min-h-[1.25rem]"></p>
    </section>

    <section class="panel rounded-lg p-5 md:p-7 mb-8" aria-label="擇日條件">
      <h2 class="text-2xl gold-text mb-5">擇日條件</h2>
      <div class="flex flex-wrap gap-3 items-end">
        <label class="flex flex-col text-sm gap-1.5">意圖
          <select id="intent" class="field w-40">${intents}</select>
        </label>
        <label class="flex flex-col text-sm gap-1.5">天數
          <input id="days" type="number" value="60" min="1" max="120" class="field w-24" />
        </label>
        <label class="flex flex-col text-sm gap-1.5">最低分數
          <input id="minScore" type="number" value="70" min="0" max="100" class="field w-24" />
        </label>
        <button id="run" class="btn-gold">掃描吉日</button>
        <button id="export" class="btn-outline">匯出 ICS</button>
      </div>
    </section>

    <p id="status" class="text-sm text-[color:var(--gold-bright)]/75 mb-3 tracking-wide"></p>
    <section id="results" class="panel rounded-lg px-5 md:px-7 py-2 mb-12" aria-live="polite"></section>

    <footer class="text-center text-xs text-[color:var(--gold)]/50 tracking-widest pb-6">
      通書 × 西洋占星 · 零付費天文核心 · 紅金擇日
    </footer>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);

    function profilePayload() {
      const birthDate = $('birthDate').value;
      const westernSign = $('westernSign').value || undefined;
      const chineseZodiac = $('chineseZodiac').value || undefined;
      const useDayBranch = $('useDayBranch').checked;
      return { birthDate, westernSign, chineseZodiac, useDayBranch };
    }

    async function autofill() {
      const birthDate = $('birthDate').value;
      if (!birthDate) return;
      const res = await fetch('/api/suggest?birthDate=' + encodeURIComponent(birthDate));
      const data = await res.json();
      if (data.error) {
        $('profileHint').textContent = data.error;
        return;
      }
      $('westernSign').value = data.westernSign;
      $('chineseZodiac').value = data.chineseZodiac;
      $('profileHint').textContent =
        '已推算：' + data.westernSignZh + '（太陽 ' + data.natalSunLongitude.toFixed(1) + '°）· 生肖' + data.chineseZodiac + ' · 日支' + data.dayBranch;
    }

    async function refreshProfileHint() {
      const p = profilePayload();
      if (!p.birthDate) return;
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (data.error) {
        $('profileHint').textContent = data.error;
        return;
      }
      const fav = (data.profile.favorableBranches || []).join('');
      $('profileHint').textContent =
        data.westernSignZh + ' · 生肖' + data.chineseZodiac +
        '（本人支' + data.profile.chineseBranch + '／喜' + fav + '／沖' + data.profile.clashBranch + '）' +
        (data.notes && data.notes.length ? ' · ' + data.notes[0] : '');
    }

    async function scan() {
      const intent = $('intent').value;
      const days = Number($('days').value);
      const minScore = Number($('minScore').value);
      $('status').textContent = '紅金擇日計算中…';
      $('results').innerHTML = '';
      const res = await fetch('/api/range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profilePayload(), intent, days, minScore }),
      });
      const data = await res.json();
      if (data.error) {
        $('status').textContent = data.error;
        return;
      }
      const prof = data.profile || {};
      $('status').textContent =
        '為「' + (prof.westernSignZh || prof.westernSign || '') + ' · 生肖' + (prof.chineseZodiac || '') +
        '」找到 ' + data.count + ' 個吉日（' + data.start + ' 起 ' + data.days + ' 日）';

      if (!data.results.length) {
        $('results').innerHTML = '<p class="py-8 text-center text-[color:var(--gold-bright)]/60">沒有符合條件的日期，可調低最低分數。</p>';
        return;
      }

      $('results').innerHTML = data.results.slice(0, 20).map((r, i) => {
        const hours = (r.bestHours || []).slice(0, 3).map(h => h.branch + '時 ' + h.clockRange).join(' · ') || '—';
        return '<article class="result-row" style="animation-delay:' + (i * 0.04) + 's">'
          + '<div class="flex flex-wrap justify-between gap-2 items-baseline">'
          + '<h2 class="text-xl md:text-2xl text-[color:var(--gold-bright)]">' + r.date
          + ' <span class="text-[color:var(--gold)] font-bold">' + r.score + ' 分</span></h2>'
          + '<span class="text-sm text-[color:var(--gold)]/60">通書 ' + r.tongshuScore + '／占星 ' + r.astrologyScore + '</span></div>'
          + '<p class="mt-2 text-sm text-[color:var(--paper-gold)]/90">' + r.tongshu.dayGanZhi
          + ' · 建除' + r.tongshu.jianChu + ' · ' + r.tongshu.shiErShen
          + '（' + r.tongshu.huangHeiDao + '） · 日' + r.astrology.sunSign
          + '／月' + r.astrology.moonSign
          + (r.astrology.mercuryRetrograde ? ' · 水逆' : '') + '</p>'
          + '<p class="mt-1 text-sm text-[color:var(--gold-bright)]/75">吉時：' + hours + '</p>'
          + (r.flags.length ? '<p class="mt-1 text-sm text-[#f0d78c]">旗標：' + r.flags.join('、') + '</p>' : '')
          + (r.warnings.length ? '<p class="mt-1 text-sm text-[#ffb4a8]">' + r.warnings.join('；') + '</p>' : '')
          + '</article>';
      }).join('');
    }

    $('autofill').onclick = autofill;
    $('birthDate').onchange = () => { autofill().then(refreshProfileHint); };
    $('westernSign').onchange = refreshProfileHint;
    $('chineseZodiac').onchange = refreshProfileHint;
    $('useDayBranch').onchange = refreshProfileHint;
    $('run').onclick = scan;
    $('export').onclick = async () => {
      const body = {
        ...profilePayload(),
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
      $('status').textContent = data.error
        ? data.error
        : '已匯出 ' + data.count + ' 筆 → ' + data.path;
    };

    // Bootstrap defaults for demo profile
    $('westernSign').value = 'Taurus';
    $('chineseZodiac').value = '猴';
    refreshProfileHint().then(scan);
  </script>
</body>
</html>`;
}
