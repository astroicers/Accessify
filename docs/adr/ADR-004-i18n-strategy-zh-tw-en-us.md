# [ADR-004]: i18n 策略 — 強制 i18n、僅 zh-TW + en-US

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

使用者要求**強制使用 i18n 處理語言**，且**只設計繁體中文（台灣）與英文（美國）**。產品橫跨前端 UI、後端 API 訊息、以及雙語報表（HTML/PDF/Excel）三端，需一致策略避免 hardcoded 字串散落與重複維護。

---

## 評估選項（Options Considered）

### 選項 A：i18next 三端共用 catalog

- **優點**：i18next 同時支援前端（react-i18next）與 Node 後端與純樣板；**key-based、單一 catalog 來源**；離線、無外部服務；社群成熟。
- **缺點**：報表樣板需接 i18next runtime（小工程）。
- **風險**：catalog 漂移 → 以 lint + key 缺漏檢查緩解。

### 選項 B：前端 i18next + 後端各自字串

- **缺點**：兩套來源、易漂移、報表又一套；違反「強制且一致」。

### 選項 C：自製輕量 i18n

- **缺點**：重造輪子，違反不過度設計。

---

## 決策（Decision）

採 **選項 A：i18next**，並訂規範：

1. **語言集合固定**：`zh-TW`（預設）、`en-US`（fallback）。**不開放其他語系**。
2. **零 hardcoded 使用者可見字串**：UI、API 回應訊息、錯誤、報表、Email（若啟用）一律走 i18next key。若啟用內網 SMTP，email 內容亦受離線鐵則約束（無外部圖片／CDN／追蹤像素）。
3. **單一 catalog 來源**：`packages/shared/locales/` 集中 `zh-TW.json` / `en-US.json`，三端共用。
4. **lint 強制**：ESLint 規則禁止 JSX/字串字面值為使用者可見文案；CI 檢查兩語系 key 對齊（無缺漏、無多餘）。
5. **WCAG 對應 / 報表內容**：規則說明、修正建議、嚴重度名稱皆雙語 key。
6. **語言切換**：Web Portal 提供切換並持久化偏好；報表產生時指定語言。
7. **語言解析優先序**：使用者持久化偏好 > 明確 `?lang` 參數 > 預設 `zh-TW`；瀏覽器 `Accept-Language` 不得凌駕「預設 `zh-TW`」。

---

## 後果（Consequences）

**正面影響：**
- 字串集中、雙語一致、無漂移；新增文案有 lint 守門。

**負面影響 / 技術債：**
- 報表樣板需接 i18n runtime；初期建置略增。

**後續追蹤：**
- [ ] M0：i18next 基礎框架 + catalog 結構 + no-hardcoded lint 規則。
- [ ] 各 milestone：新文案一律加 key（gate G2 術語/文案審查）。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 語系數 | 恰 2（zh-TW, en-US） | catalog 檢視 | 全程 |
| hardcoded 字串 | 0（使用者可見） | lint 規則 | CI 每次 |
| 雙語 key 對齊 | 100%（無缺漏） | key-diff 檢查 | CI 每次 |

---

## 關聯（Relations）

- 參考：ADR-005（前端）、UIUX_SPEC.md、frontend_quality profile（i18n 強制）

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
