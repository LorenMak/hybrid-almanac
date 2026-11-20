# 紅金擇日 · Hybrid Almanac

中西雙曆法個人運程與擇日系統（Chinese Tongshu × Western Astrology）

> 由一名對**語學、天文**與**中國傳統文化**有興趣的工程學生開發。  
> 香港中文大學 · 新亞書院（The Chinese University of Hong Kong · New Asia College）

本專案以現代 TypeScript 工程方法，把通勝擇日（建除、十二神、宜忌、陰陽五行）與西洋黃道經度／相位放在同一套天文核心上，並提供紅金風格的本地儀表板、日曆模式、個人命盤輸入、報時報天氣與每日金句。

## 開發背景

通勝（通書）與西洋占星長期各自表述。本專案嘗試：

1. **天文共通**：節氣與黃道皆可追溯至黃道經度／儒略日；
2. **通勝正統取向**：參考廣經堂出版社編輯說明——宜忌／神煞依陰陽五行（生剋制化、生旺休囚）；二十八宿僅作紀曆；雜煞不干擾良辰判斷；
3. **個人化**：用家輸入出生年月日、星座、生肖後，依喜用支／沖支與本命太陽相位評分；
4. **可工程化**：零付費 API、可本地執行、可匯出 ICS。

作者身份定位：CUHK New Asia College 工程學生，興趣橫跨計算、天文與中國語文／傳統曆法文化。

## 快速開始

```bash
npm install
npm start          # CLI：未來 60 日 EXAM / DRIVING Top 5 + ICS
npm run dashboard  # 紅金儀表板 → http://127.0.0.1:3456
npm run typecheck
```

## 功能一覽

| 模組 | 說明 |
|------|------|
| 通書引擎 | 四柱、建除、十二神、宜忌、時辰；五行月令；雜煞過濾 |
| 占星引擎 | 日月水金火木黃道經度、水逆、本命太陽相位 |
| 評分引擎 | 12 種意圖（考試／嫁娶／搬家／開業…） |
| 日曆模式 | 月視圖著色分數、點擊明細 |
| 報時天氣金句 | 依位置報時；wttr.in + Weather.com 外連；每日金句 |
| ICS 匯出 | 繁中摘要吉日曆 |

## 專案結構

```
config/userProfile.ts          # 預設命盤與意圖
src/engines/tongshuEngine.ts
src/engines/astrologyEngine.ts
src/engines/scoringEngine.ts
src/exporters/icsExporter.ts
src/utils/orthodoxWuxing.ts    # 廣經堂取向五行／雜煞
src/services/weatherService.ts
src/services/quoteService.ts
src/web/server.ts              # Express 儀表板
src/index.ts                   # CLI
```

## 技術棧

- TypeScript / Node.js
- `lunar-typescript` · `astronomy-engine` · `ics` · `opencc-js` · Express

## 授權

MIT License — 歡迎新亞／中大同學與對傳統曆法有興趣的工程師一起改進。

## 作者

**Loren Mak**  
香港中文大學 · 新亞書院 · 工程學科學生  
興趣：語學、天文、中國傳統文化與可計算的人文工具

---

*Hybrid Almanac — bridging 通勝 and the ecliptic, built at New Asia.*
