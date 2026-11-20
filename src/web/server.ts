/**
 * Lightweight local dashboard — Express + Tailwind CDN.
 * 紅金傳統風格介面；可輸入星座／生肖／出生年月日輔助擇日。
 */

import express from 'express';
import { resolve } from 'node:path';
import {
  DEFAULT_USER_PROFILE,
  INTENT_LABELS,
  parseIntent,
  type Intent,
  type UserProfile,
} from '../../config/userProfile.js';
import { scoreDay, scoreMonth, scoreRange } from '../engines/scoringEngine.js';
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
import { getDailyQuote, getQuotesAround } from '../services/quoteService.js';
import {
  DEFAULT_LOCATION,
  fetchWeatherBrief,
  type GeoLocation,
} from '../services/weatherService.js';

const PORT = Number(process.env.PORT ?? 3456);
const app = express();

app.use(express.json());

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
  res.json({ ok: true, today: todayHktYmd(), profile: DEFAULT_USER_PROFILE.birthDate });
});

app.get('/api/meta', (_req, res) => {
  const today = todayHktYmd();
  res.json({
    today,
    westernSigns: SIGN_NAMES.map((s) => ({ id: s, label: WESTERN_SIGN_LABELS[s] })),
    chineseZodiacs: CHINESE_ZODIAC_LIST.map((z) => ({ id: z, label: z })),
    intents: (Object.keys(INTENT_LABELS) as Intent[]).map((k) => ({
      id: k,
      label: INTENT_LABELS[k],
    })),
    defaultProfile: {
      /** 儀表板預設：用家當天日期（可再改）. */
      birthDate: today,
      westernSign: '',
      chineseZodiac: '',
    },
    orthodoxNote:
      '宜忌／神煞依正統陰陽五行（生剋制化、生旺休囚）；二十八宿僅紀曆；雜煞已過濾（廣經堂通勝取向）。',
  });
});

/** 每日金句 */
app.get('/api/quote', (req, res) => {
  const date = String(req.query.date ?? todayHktYmd());
  res.json({ quote: getDailyQuote(date), more: getQuotesAround(date, 3) });
});

/** 報時＋報天氣（依位置）；並附 Weather.com 等外連 */
app.get('/api/weather', async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? DEFAULT_LOCATION.lat);
    const lon = Number(req.query.lon ?? DEFAULT_LOCATION.lon);
    const label = (req.query.label as string) || DEFAULT_LOCATION.label;
    const timezone = (req.query.timezone as string) || undefined;
    const loc: GeoLocation = { lat, lon, label, timezone };
    const brief = await fetchWeatherBrief(loc);
    const quote = getDailyQuote(todayHktYmd());
    res.json({ weather: brief, quote });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'weather error' });
  }
});

app.post('/api/weather', async (req, res) => {
  try {
    const lat = Number(req.body?.lat ?? DEFAULT_LOCATION.lat);
    const lon = Number(req.body?.lon ?? DEFAULT_LOCATION.lon);
    const label = (req.body?.label as string) || DEFAULT_LOCATION.label;
    const timezone = (req.body?.timezone as string) || undefined;
    const brief = await fetchWeatherBrief({ lat, lon, label, timezone });
    const quote = getDailyQuote(todayHktYmd());
    res.json({ weather: brief, quote });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'weather error' });
  }
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

/** Month calendar: score every day in YYYY-MM for an intent + profile. */
app.post('/api/calendar', (req, res) => {
  const intent = parseIntent(req.body?.intent);
  if (!intent) {
    res.status(400).json({ error: 'invalid intent' });
    return;
  }
  try {
    const now = todayHktYmd();
    const year = Number(req.body?.year ?? now.slice(0, 4));
    const month = Number(req.body?.month ?? now.slice(5, 7));
    if (!Number.isInteger(year) || month < 1 || month > 12) {
      res.status(400).json({ error: 'invalid year/month' });
      return;
    }
    const { profile, meta } = resolveProfile(req.body ?? {});
    const days = scoreMonth(year, month, intent, profile);
    const firstWeekday = new Date(`${year}-${String(month).padStart(2, '0')}-01T12:00:00+08:00`).getDay();
    res.json({
      year,
      month,
      intent,
      intentLabel: INTENT_LABELS[intent],
      firstWeekday,
      days,
      profile: meta
        ? {
            birthDate: profile.birthDate,
            chineseZodiac: meta.chineseZodiac,
            westernSignZh: meta.westernSignZh,
            chineseBranch: profile.chineseBranch,
          }
        : { birthDate: profile.birthDate, westernSign: profile.natalSunSign },
    });
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
  const intents = (Object.keys(INTENT_LABELS) as (keyof typeof INTENT_LABELS)[])
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
      --gold: #d4af37;
      --gold-bright: #f0d78c;
      --gold-dim: #a68523;
      --paper-gold: #fff6e0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: 'Noto Serif TC', 'ZCOOL XiaoWei', serif;
      color: var(--paper-gold);
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(240,215,140,0.28), transparent 55%),
        radial-gradient(ellipse 60% 40% at 100% 30%, rgba(212,175,55,0.12), transparent 50%),
        linear-gradient(165deg, var(--cinnabar-deep) 0%, var(--cinnabar) 42%, #7a1010 78%, #4a0808 100%);
      background-attachment: fixed;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.07;
      background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='%23d4af37' stroke-width='0.6'/%3E%3C/svg%3E");
    }
    h1, h2, .brand { font-family: 'ZCOOL XiaoWei', 'Noto Serif TC', serif; }
    .gold-text {
      background: linear-gradient(120deg, #fff1c1 0%, var(--gold) 40%, #fff6e0 55%, var(--gold-bright) 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .gold-rule { height: 1px; background: linear-gradient(90deg, transparent, var(--gold), transparent); border: 0; }
    .panel {
      background: linear-gradient(145deg, rgba(92,10,10,0.72), rgba(122,16,16,0.55));
      border: 1px solid rgba(212,175,55,0.45);
      box-shadow: 0 0 0 1px rgba(240,215,140,0.12), 0 18px 40px rgba(0,0,0,0.35);
      backdrop-filter: blur(6px);
    }
    .field {
      background: rgba(26,8,8,0.45); border: 1px solid rgba(212,175,55,0.35);
      color: var(--paper-gold); border-radius: 0.35rem; padding: 0.55rem 0.75rem; width: 100%;
    }
    .field:focus { outline: none; border-color: var(--gold-bright); box-shadow: 0 0 0 2px rgba(212,175,55,0.25); }
    .field option { background: #5c0a0a; color: #fff6e0; }
    .btn-gold {
      background: linear-gradient(180deg, #f0d78c 0%, #d4af37 48%, #a68523 100%);
      color: #4a0808; font-weight: 700; border: 1px solid #fff1c1; border-radius: 0.35rem;
      padding: 0.65rem 1.35rem; letter-spacing: 0.08em;
    }
    .btn-gold:hover { filter: brightness(1.08); }
    .btn-outline {
      background: transparent; color: var(--gold-bright); border: 1px solid rgba(212,175,55,0.65);
      border-radius: 0.35rem; padding: 0.65rem 1.2rem; font-weight: 600;
    }
    .btn-outline:hover { background: rgba(212,175,55,0.12); }
    .btn-outline.active { background: rgba(212,175,55,0.22); border-color: var(--gold-bright); }
    .result-row { border-bottom: 1px solid rgba(212,175,55,0.2); padding: 1rem 0; }
    .result-row:last-child { border-bottom: 0; }
    label .hint { color: rgba(240,215,140,0.65); font-size: 0.75rem; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.4rem; }
    .cal-head { text-align: center; font-size: 0.75rem; color: rgba(240,215,140,0.7); padding: 0.35rem 0; letter-spacing: 0.12em; }
    .cal-cell {
      min-height: 4.6rem; border-radius: 0.4rem; border: 1px solid rgba(212,175,55,0.22);
      padding: 0.35rem; cursor: pointer; transition: transform 0.12s ease, border-color 0.12s ease;
      background: rgba(26,8,8,0.35);
    }
    .cal-cell:hover { transform: translateY(-1px); border-color: var(--gold); }
    .cal-cell.selected { border-color: var(--gold-bright); box-shadow: 0 0 0 1px rgba(240,215,140,0.35); }
    .cal-cell.empty { visibility: hidden; pointer-events: none; }
    .cal-cell.score-hi { background: linear-gradient(160deg, rgba(212,175,55,0.45), rgba(143,20,20,0.55)); }
    .cal-cell.score-mid { background: rgba(166,133,35,0.22); }
    .cal-cell.score-lo { background: rgba(26,8,8,0.45); opacity: 0.75; }
    .cal-cell .day-num { font-size: 0.95rem; color: var(--gold-bright); }
    .cal-cell .day-score { font-size: 0.8rem; color: var(--gold); font-weight: 700; }
    .cal-cell .day-tag { font-size: 0.65rem; color: rgba(255,246,224,0.7); margin-top: 0.15rem; }
    .mode-list .cal-only { display: none; }
    .mode-calendar .list-only { display: none; }
  </style>
</head>
<body>
  <main class="relative max-w-5xl mx-auto px-4 py-10 md:py-14">
    <header class="mb-10 text-center md:text-left">
      <p class="brand tracking-[0.35em] text-sm text-[color:var(--gold-bright)] mb-3">紅金擇日 · HYBRID ALMANAC</p>
      <h1 class="text-4xl md:text-6xl font-black leading-tight gold-text">中西雙曆法<br class="md:hidden" />個人運程與擇日</h1>
      <p class="mt-4 max-w-2xl mx-auto md:mx-0 text-[color:var(--gold-bright)]/85 text-base md:text-lg">
        輸入出生年月日、星座與生肖，以<strong class="text-[color:var(--gold)]">列表</strong>或<strong class="text-[color:var(--gold)]">日曆</strong>模式瀏覽吉日；通勝參考廣經堂正統陰陽五行。
      </p>
      <hr class="gold-rule mt-8" />
    </header>

    <section class="panel rounded-lg p-5 md:p-7 mb-8" aria-label="報時報天氣金句">
      <div class="flex flex-wrap justify-between gap-3 items-start mb-3">
        <h2 class="text-2xl gold-text">報時 · 報天氣 · 金句</h2>
        <button type="button" id="locateBtn" class="btn-outline text-sm py-2 px-3">定位我的位置</button>
      </div>
      <p id="clockLine" class="text-lg text-[color:var(--gold-bright)] tracking-wide mb-2">—</p>
      <p id="weatherLine" class="text-sm mb-3 opacity-90">天氣載入中…</p>
      <blockquote id="quoteLine" class="border-l-2 border-[color:var(--gold)] pl-4 text-[color:var(--gold-bright)] italic mb-4">「…」</blockquote>
      <div id="extLinks" class="flex flex-wrap gap-3 text-sm"></div>
      <p class="hint mt-3 text-xs opacity-60">天氣資料來自 wttr.in；詳細預報請開啟 Weather.com。通勝宜忌依陰陽五行，二十八宿僅作紀曆參考。</p>
    </section>

    <section class="panel rounded-lg p-5 md:p-7 mb-8" aria-label="個人命盤">
      <h2 class="text-2xl gold-text mb-1">個人命盤</h2>
      <p class="text-sm text-[color:var(--gold-bright)]/70 mb-5">預設為<strong>今天</strong>；可改成您的真實出生日。留空星座／生肖時自動推算。</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label class="flex flex-col gap-1.5 text-sm">出生年月日
          <input id="birthDate" type="date" class="field" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm">西洋星座
          <select id="westernSign" class="field"><option value="">自動推算</option>${westernOpts}</select>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">生肖
          <select id="chineseZodiac" class="field"><option value="">自動推算（農曆年）</option>${zodiacOpts}</select>
        </label>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-4">
        <label class="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input id="useDayBranch" type="checkbox" class="accent-[color:var(--gold)]" /> 改用出生日柱地支
        </label>
        <button type="button" id="autofill" class="btn-outline text-sm py-2 px-3">依生日自動填入</button>
      </div>
      <p id="profileHint" class="mt-4 text-sm text-[color:var(--gold-bright)]/80 min-h-[1.25rem]"></p>
    </section>

    <section class="panel rounded-lg p-5 md:p-7 mb-8" aria-label="擇日條件">
      <h2 class="text-2xl gold-text mb-5">擇日條件</h2>
      <div class="flex flex-wrap gap-3 items-end mb-4">
        <label class="flex flex-col text-sm gap-1.5">意圖
          <select id="intent" class="field min-w-[11rem]">${intents}</select>
        </label>
        <label class="flex flex-col text-sm gap-1.5 list-only">天數
          <input id="days" type="number" value="60" min="1" max="120" class="field w-24" />
        </label>
        <label class="flex flex-col text-sm gap-1.5 list-only">最低分數
          <input id="minScore" type="number" value="70" min="0" max="100" class="field w-24" />
        </label>
        <div class="flex gap-2 cal-only items-end">
          <label class="flex flex-col text-sm gap-1.5">年份
            <input id="calYear" type="number" class="field w-24" />
          </label>
          <label class="flex flex-col text-sm gap-1.5">月份
            <input id="calMonth" type="number" min="1" max="12" class="field w-20" />
          </label>
        </div>
        <button id="run" class="btn-gold">掃描吉日</button>
        <button id="export" class="btn-outline list-only">匯出 ICS</button>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-sm text-[color:var(--gold-bright)]/70 mr-1">檢視</span>
        <button type="button" id="modeList" class="btn-outline active text-sm py-2 px-3">列表模式</button>
        <button type="button" id="modeCalendar" class="btn-outline text-sm py-2 px-3">日曆模式</button>
        <button type="button" id="calPrev" class="btn-outline text-sm py-2 px-3 cal-only">上一月</button>
        <button type="button" id="calNext" class="btn-outline text-sm py-2 px-3 cal-only">下一月</button>
      </div>
    </section>

    <p id="status" class="text-sm text-[color:var(--gold-bright)]/75 mb-3 tracking-wide"></p>
    <div id="appShell" class="mode-list">
      <section id="results" class="panel rounded-lg px-5 md:px-7 py-2 mb-6 list-only" aria-live="polite"></section>
      <section id="calendarPanel" class="panel rounded-lg p-5 md:p-7 mb-6 cal-only" aria-live="polite">
        <div class="flex flex-wrap justify-between items-baseline mb-4 gap-2">
          <h2 id="calTitle" class="text-2xl gold-text"></h2>
          <p class="text-xs text-[color:var(--gold-bright)]/65">金亮＝高分 · 點擊日期查看明細</p>
        </div>
        <div class="cal-grid mb-2">
          <div class="cal-head">日</div><div class="cal-head">一</div><div class="cal-head">二</div>
          <div class="cal-head">三</div><div class="cal-head">四</div><div class="cal-head">五</div><div class="cal-head">六</div>
        </div>
        <div id="calGrid" class="cal-grid"></div>
        <div id="calDetail" class="mt-5 pt-4 border-t border-[color:var(--gold)]/25 text-sm"></div>
      </section>
    </div>

    <footer class="text-center text-xs text-[color:var(--gold)]/50 tracking-widest pb-6 leading-relaxed">
      通書 × 西洋占星 · 列表／日曆 · 紅金擇日<br/>
      香港中文大學 · 新亞書院 · 工程學生作品 · 語學／天文／中國傳統文化
    </footer>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    let viewMode = 'list';
    let lastCalendarDays = [];
    let selectedDate = null;
    let userGeo = { lat: 22.3193, lon: 114.1694, label: 'Hong Kong', timezone: 'Asia/Hong_Kong' };

    const now = new Date();
    const hkt = new Date(now.getTime() + 8 * 3600 * 1000);
    const todayStr = hkt.toISOString().slice(0, 10);
    $('birthDate').value = todayStr;
    $('calYear').value = hkt.getUTCFullYear();
    $('calMonth').value = hkt.getUTCMonth() + 1;

    function tickClock() {
      try {
        $('clockLine').textContent = new Intl.DateTimeFormat('zh-HK', {
          timeZone: userGeo.timezone || 'Asia/Hong_Kong',
          year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date()) + '（' + (userGeo.label || '本地') + '）';
      } catch (_) {
        $('clockLine').textContent = new Date().toLocaleString('zh-HK');
      }
    }
    setInterval(tickClock, 1000);
    tickClock();

    async function loadWeatherQuote() {
      const q = new URLSearchParams({
        lat: String(userGeo.lat), lon: String(userGeo.lon),
        label: userGeo.label || '', timezone: userGeo.timezone || '',
      });
      const res = await fetch('/api/weather?' + q.toString());
      const data = await res.json();
      if (data.error) {
        $('weatherLine').textContent = data.error;
        return;
      }
      const w = data.weather;
      userGeo.timezone = w.timezone || userGeo.timezone;
      tickClock();
      const temp = w.tempC != null ? w.tempC + '°C' : '—';
      $('weatherLine').textContent =
        w.locationLabel + ' · ' + w.description + ' · ' + temp
        + (w.humidity != null ? ' · 濕度 ' + w.humidity + '%' : '')
        + (w.windKmph != null ? ' · 風 ' + w.windKmph + ' km/h' : '');
      const quote = data.quote;
      $('quoteLine').innerHTML = '「' + quote.textZh + '」'
        + '<span class="not-italic block text-xs mt-1 opacity-70">— ' + quote.source + ' · 今日金句</span>';
      $('extLinks').innerHTML = [
        ['Weather.com', w.links.weatherComZh || w.links.weatherCom],
        ['Weather.com (EN)', w.links.weatherCom],
        ['wttr.in', w.links.wttr],
        ['TimeandDate', w.links.timeAndDate],
        ['Open-Meteo', w.links.openMeteo],
      ].map(([name, href]) =>
        '<a class="underline decoration-[color:var(--gold)] text-[color:var(--gold-bright)]" target="_blank" rel="noopener" href="' + href + '">' + name + '</a>'
      ).join('');
    }

    function requestLocation() {
      if (!navigator.geolocation) {
        loadWeatherQuote();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userGeo = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label: pos.coords.latitude.toFixed(3) + ',' + pos.coords.longitude.toFixed(3),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
          loadWeatherQuote();
        },
        () => loadWeatherQuote(),
        { enableHighAccuracy: false, timeout: 8000 }
      );
    }
    $('locateBtn').onclick = requestLocation;

    function profilePayload() {
      return {
        birthDate: $('birthDate').value,
        westernSign: $('westernSign').value || undefined,
        chineseZodiac: $('chineseZodiac').value || undefined,
        useDayBranch: $('useDayBranch').checked,
      };
    }

    function setMode(mode) {
      viewMode = mode;
      $('appShell').className = mode === 'calendar' ? 'mode-calendar' : 'mode-list';
      $('modeList').classList.toggle('active', mode === 'list');
      $('modeCalendar').classList.toggle('active', mode === 'calendar');
      // show/hide list-only and cal-only in conditions row via CSS on #appShell + siblings:
      document.querySelectorAll('.list-only').forEach((el) => {
        el.style.display = mode === 'list' ? '' : 'none';
      });
      document.querySelectorAll('.cal-only').forEach((el) => {
        el.style.display = mode === 'calendar' ? '' : 'none';
      });
      scan();
    }

    function scoreClass(score) {
      if (score >= 80) return 'score-hi';
      if (score >= 60) return 'score-mid';
      return 'score-lo';
    }

    function renderDayDetail(r) {
      if (!r) { $('calDetail').innerHTML = ''; return; }
      const hours = (r.bestHours || []).slice(0, 3).map(h => h.branch + '時 ' + h.clockRange).join(' · ') || '—';
      $('calDetail').innerHTML =
        '<h3 class="text-xl text-[color:var(--gold-bright)] mb-2">' + r.date + ' · ' + r.score + ' 分</h3>'
        + '<p>' + r.tongshu.dayGanZhi + ' · 建除' + r.tongshu.jianChu + ' · ' + r.tongshu.shiErShen
        + '（' + r.tongshu.huangHeiDao + '）</p>'
        + '<p class="mt-1 opacity-90">日' + r.astrology.sunSign + '／月' + r.astrology.moonSign
        + (r.astrology.mercuryRetrograde ? ' · 水逆' : '') + '</p>'
          + '<p class="mt-1">吉時：' + hours + '</p>'
          + '<p class="mt-1 opacity-80">宜：' + (r.tongshu.yi || []).slice(0, 8).join('、') + '</p>'
          + (r.tongshu.wuxing ? '<p class="mt-1 opacity-80">五行：' + r.tongshu.wuxing.label + '</p>' : '')
          + (r.tongshu.xiuNote ? '<p class="mt-1 text-xs opacity-55">' + r.tongshu.xiuNote + '</p>' : '')
          + (r.flags.length ? '<p class="mt-1 text-[#f0d78c]">旗標：' + r.flags.join('、') + '</p>' : '')
          + (r.warnings.length ? '<p class="mt-1 text-[#ffb4a8]">' + r.warnings.join('；') + '</p>' : '');
    }

    function paintCalendarSelection() {
      $('calGrid').querySelectorAll('[data-date]').forEach((btn) => {
        btn.classList.toggle('selected', btn.getAttribute('data-date') === selectedDate);
      });
    }

    function renderCalendar(data) {
      lastCalendarDays = data.days || [];
      $('calTitle').textContent = data.year + ' 年 ' + data.month + ' 月 · ' + (data.intentLabel || '');
      if (!selectedDate || !lastCalendarDays.some((d) => d.date === selectedDate)) {
        const best = [...lastCalendarDays].sort((a, b) => b.score - a.score)[0];
        selectedDate = best ? best.date : null;
      }
      const cells = [];
      for (let i = 0; i < data.firstWeekday; i++) cells.push('<div class="cal-cell empty"></div>');
      for (const r of lastCalendarDays) {
        const day = Number(r.date.slice(8, 10));
        const sel = selectedDate === r.date ? ' selected' : '';
        cells.push(
          '<button type="button" class="cal-cell ' + scoreClass(r.score) + sel + '" data-date="' + r.date + '">'
          + '<div class="day-num">' + day + '</div>'
          + '<div class="day-score">' + r.score + '</div>'
          + '<div class="day-tag">' + r.tongshu.jianChu + '·' + r.tongshu.dayBranch + '</div>'
          + '</button>'
        );
      }
      $('calGrid').innerHTML = cells.join('');
      $('calGrid').querySelectorAll('[data-date]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedDate = btn.getAttribute('data-date');
          paintCalendarSelection();
          renderDayDetail(lastCalendarDays.find((d) => d.date === selectedDate));
        });
      });
      renderDayDetail(lastCalendarDays.find((d) => d.date === selectedDate));
    }

    async function autofill() {
      const birthDate = $('birthDate').value;
      if (!birthDate) return;
      const res = await fetch('/api/suggest?birthDate=' + encodeURIComponent(birthDate));
      const data = await res.json();
      if (data.error) { $('profileHint').textContent = data.error; return; }
      $('westernSign').value = data.westernSign;
      $('chineseZodiac').value = data.chineseZodiac;
      $('profileHint').textContent =
        '已推算：' + data.westernSignZh + '（太陽 ' + data.natalSunLongitude.toFixed(1) + '°）· 生肖' + data.chineseZodiac + ' · 日支' + data.dayBranch;
    }

    async function refreshProfileHint() {
      const p = profilePayload();
      if (!p.birthDate) return;
      const res = await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      const data = await res.json();
      if (data.error) { $('profileHint').textContent = data.error; return; }
      const fav = (data.profile.favorableBranches || []).join('');
      $('profileHint').textContent =
        data.westernSignZh + ' · 生肖' + data.chineseZodiac +
        '（本人支' + data.profile.chineseBranch + '／喜' + fav + '／沖' + data.profile.clashBranch + '）';
    }

    async function scanList() {
      const intent = $('intent').value;
      const days = Number($('days').value);
      const minScore = Number($('minScore').value);
      $('status').textContent = '列表掃描中…';
      $('results').innerHTML = '';
      const res = await fetch('/api/range', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profilePayload(), intent, days, minScore }),
      });
      const data = await res.json();
      if (data.error) { $('status').textContent = data.error; return; }
      const prof = data.profile || {};
      $('status').textContent =
        '「' + (prof.westernSignZh || '') + ' · 生肖' + (prof.chineseZodiac || '') + '」· '
        + ($('intent').selectedOptions[0]?.text || intent) + ' · 找到 ' + data.count + ' 日';
      if (!data.results.length) {
        $('results').innerHTML = '<p class="py-8 text-center opacity-60">沒有符合條件的日期。</p>';
        return;
      }
      $('results').innerHTML = data.results.slice(0, 25).map((r) => {
        const hours = (r.bestHours || []).slice(0, 3).map(h => h.branch + '時 ' + h.clockRange).join(' · ') || '—';
        return '<article class="result-row">'
          + '<div class="flex flex-wrap justify-between gap-2 items-baseline">'
          + '<h2 class="text-xl md:text-2xl text-[color:var(--gold-bright)]">' + r.date
          + ' <span class="text-[color:var(--gold)] font-bold">' + r.score + ' 分</span></h2>'
          + '<span class="text-sm opacity-60">通書 ' + r.tongshuScore + '／占星 ' + r.astrologyScore + '</span></div>'
          + '<p class="mt-2 text-sm">' + r.tongshu.dayGanZhi + ' · 建除' + r.tongshu.jianChu + ' · '
          + r.tongshu.shiErShen + '（' + r.tongshu.huangHeiDao + '） · 日' + r.astrology.sunSign
          + '／月' + r.astrology.moonSign + (r.astrology.mercuryRetrograde ? ' · 水逆' : '') + '</p>'
          + '<p class="mt-1 text-sm opacity-80">吉時：' + hours + '</p>'
          + (r.tongshu.wuxing ? '<p class="mt-1 text-sm opacity-75">五行：' + r.tongshu.wuxing.label + '</p>' : '')
          + (r.flags.length ? '<p class="mt-1 text-sm text-[#f0d78c]">旗標：' + r.flags.join('、') + '</p>' : '')
          + '</article>';
      }).join('');
    }

    async function scanCalendar() {
      const year = Number($('calYear').value);
      const month = Number($('calMonth').value);
      const intent = $('intent').value;
      $('status').textContent = '日曆計算中…';
      selectedDate = null;
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profilePayload(), intent, year, month }),
      });
      const data = await res.json();
      if (data.error) { $('status').textContent = data.error; return; }
      const hi = data.days.filter((d) => d.score >= 80).length;
      $('status').textContent =
        data.year + '/' + data.month + ' · ' + data.intentLabel + ' · 本月 ≥80 分共 ' + hi + ' 日';
      renderCalendar(data);
    }

    async function scan() {
      if (viewMode === 'calendar') return scanCalendar();
      return scanList();
    }

    function shiftMonth(delta) {
      let y = Number($('calYear').value);
      let m = Number($('calMonth').value) + delta;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      $('calYear').value = y;
      $('calMonth').value = m;
      scanCalendar();
    }

    $('autofill').onclick = autofill;
    $('birthDate').onchange = () => { autofill().then(refreshProfileHint); };
    $('westernSign').onchange = refreshProfileHint;
    $('chineseZodiac').onchange = refreshProfileHint;
    $('useDayBranch').onchange = refreshProfileHint;
    $('run').onclick = scan;
    $('modeList').onclick = () => setMode('list');
    $('modeCalendar').onclick = () => setMode('calendar');
    $('calPrev').onclick = () => shiftMonth(-1);
    $('calNext').onclick = () => shiftMonth(1);
    $('export').onclick = async () => {
      const body = {
        ...profilePayload(),
        intent: $('intent').value,
        days: Number($('days').value),
        minScore: Number($('minScore').value) || 80,
      };
      const res = await fetch('/api/export-ics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      $('status').textContent = data.error ? data.error : '已匯出 ' + data.count + ' 筆 → ' + data.path;
    };

    document.querySelectorAll('.cal-only').forEach((el) => { el.style.display = 'none'; });
    // 出生日期預設今天；星座／生肖自動推算
    autofill().then(refreshProfileHint).then(scan);
    requestLocation();
  </script>
</body>
</html>`;
}
