# Hybrid Almanac · 中西雙曆法個人運程與擇日系統

Zero-paid-API Chinese Tongshu + Western Astrology hybrid engine (Node.js + TypeScript).

## Quick start

```bash
npm install
npm start          # CLI：未來 60 日 EXAM / DRIVING Top 5 + ICS
npm run dashboard  # http://127.0.0.1:3456
npm run typecheck
```

See usage notes (繁中/bilingual): ask the project docs for `hybrid-almanac-engine.md`.

## Modules

| Path | Role |
|------|------|
| `config/userProfile.ts` | Natal profile (2004-05-19 HKT · 申 · Sun 58°) |
| `src/engines/tongshuEngine.ts` | 四柱 / 建除 / 十二神 / 宜忌 / 時辰 |
| `src/engines/astrologyEngine.ts` | Ecliptic longitudes, Rx, aspects |
| `src/engines/scoringEngine.ts` | 0–100 hybrid score + intent filters |
| `src/exporters/icsExporter.ts` | `.ics` export + LLM polish stub |

## Output

- `output/auspicious_dates.ics` — combined ≥80
- `output/auspicious_dates_exam.ics` / `_driving.ics`
