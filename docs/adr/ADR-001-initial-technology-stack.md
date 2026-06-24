# [ADR-001]: 初始技術棧選型

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

Accessify 是地端、無網際網路（軍網）場域的無障礙網頁檢測工具。核心價值在於：以 headless 瀏覽器渲染內網站台、注入無障礙規則庫掃描、將結果對應 WCAG 並產出雙語報表。需選定一套能**離線打包、單機穩定運行、最少元件**的技術棧。

關鍵限制：
- 無障礙規則庫（axe-core、HTML CodeSniffer）本質為 **JavaScript，必須在瀏覽器頁面內執行**。
- 前端採 `visual-web-stack`（React / TypeScript），語言已綁定 JS/TS 生態（見 ADR-005）。
- 穩定優先、不過度設計、難現場維護 → 元件與工具鏈越少越好。

---

## 評估選項（Options Considered）

### 選項 A：Node.js + TypeScript 全棧 monorepo

- **優點**：原生重用 axe-core / pa11y / Playwright（官方支援 JS/TS）；前後端 + 報表樣板**單一語言、單一工具鏈、共用 i18n catalog 與型別**；社群成熟、離線安裝直接。
- **缺點**：需要 Node runtime（以 Docker 映像封裝後不成問題）。
- **風險**：npm 供應鏈 → 以 lockfile + 離線 vendoring + 映像內建緩解。

### 選項 B：Rust 後端 + React 前端

- **優點**：單一靜態二進位、無 GC、資源可預測。
- **缺點**：仍須注入 JS 規則庫；**放棄官方 Playwright**（無官方 Rust binding）需以 chromiumoxide 重寫 auto-wait/retry；pa11y 編排需重寫；**雙語言 + 雙 i18n（fluent + i18next）雙工具鏈**。與「簡化 + 穩定 + 難維護」相悖。
- **風險**：瀏覽器驅動穩健性退化（正是本產品可靠度核心）。

### 選項 C：Python 後端（Playwright Python）+ React 前端

- **優點**：Playwright 有官方 Python 支援。
- **缺點**：仍雙語言、雙 i18n；axe-core 注入與 Node 同樣需 JS 層；無單語言優勢。

---

## 決策（Decision）

採 **選項 A：Node.js + TypeScript 全棧 monorepo**。

- 套件管理：npm workspaces，packages 切為 `core / scanner / mapping / report / api / web / shared`。
- 瀏覽器驅動：**Playwright（headless Chromium）**，瀏覽器二進位內建打包（離線）。
- 檢測引擎：**axe-core + pa11y / HTML CodeSniffer**（見 ADR-007）。
- 資料層：**SQLite + 內嵌佇列**（見 ADR-003）。
- 報表：i18n HTML 樣板 → PDF（Playwright print）+ Excel（ExcelJS）。
- i18n：**i18next**（前端 / 後端 / 報表共用 key，見 ADR-004）。
- 前端：React 19 + Vite + TS（visual-web-stack 基礎層，見 ADR-005）。
- 部署：Docker Compose 單機（見 ADR-002、DEPLOY_SPEC）。
- 語言/版本以 lockfile pin，可重現建置。

> 決定性理由：本產品的可靠度瓶頸在「瀏覽器驅動 + JS 規則庫」，而非後端語言執行速度。單一 TS 語言最小化工具鏈與維運面，最契合穩定優先。

---

## 後果（Consequences）

**正面影響：**
- 一套語言/工具鏈，i18n、型別、測試共用，降低維運與離線升級複雜度。
- 原生重用業界標準引擎與 Playwright，減少自製碼。

**負面影響 / 技術債：**
- 高並發 CPU 密集場景下 Node 較吃力 → 本場域為內網低流量，可接受；未來如有實測熱點再以 napi-rs 局部加速（非現在）。

**後續追蹤：**
- [ ] 於 M0 建立 monorepo 骨架與 lockfile pin 策略。
- [ ] 於 ADR-002 定義離線 vendoring 與映像建置。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 全棧單一語言 | 後端 + 前端 + 報表皆 TS | 程式碼審查 | M0 完成 |
| 離線可建置 | 斷網下 `make build` 成功 | 斷網建置測試 | M0 完成 |
| 引擎原生整合 | axe-core/pa11y 注入掃描可運行 | `make test`（M1） | M1 完成 |

---

## 關聯（Relations）

- 取代：（無）
- 參考：ADR-002（離線部署）、ADR-003（SQLite/佇列）、ADR-004（i18n）、ADR-005（前端）、ADR-007（引擎/授權）

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
