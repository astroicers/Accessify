# [ADR-007]: 掃描引擎與授權 — axe-core + pa11y、誠實涵蓋率

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

需選定無障礙檢測引擎。引擎須在 headless 瀏覽器頁面內執行（JS）、可離線打包、授權允許地端商用交付。同時須面對「自動化檢測涵蓋率有限」的事實：業界估計約 30–57% 之準則可自動判定，**分母為「至少部分可機器測試的 WCAG 2.x A/AA 成功準則（success criteria）」，且此為業界估計、非保證**（記入 `.asp-fact-check.md` FC-002）。產品定位為**人工檢測前的自動化輔助，不宣稱 100% 合規**。

三引擎授權各異、須分列查核（記入 `.asp-fact-check.md` FC-001）；引擎以 JS 注入頁面、in-browser 執行，並非傳統動態/靜態連結，故不適用「動態連結 copyleft」框架。

---

## 評估選項（Options Considered）

### 選項 A：axe-core（MPL-2.0，主）+ pa11y（LGPL-3.0-only）+ HTML_CodeSniffer（BSD-3-Clause）

- **三引擎授權分列（FC-001 為準）**：
  - **axe-core = MPL-2.0**（檔案級 copyleft；只要不修改其原始檔且不重新授權，即可封裝商用）。
  - **pa11y = LGPL-3.0-only**（以未修改之相依形式封裝；須能提供對應原始碼）。
  - **HTML_CodeSniffer（HTMLCS, squizlabs）= BSD-3-Clause**（寬鬆，非 copyleft；保留版權與授權聲明即可）。先前誤標為 LGPL，於此更正。
- **優點**：axe-core 為業界事實標準、規則品質高、誤報低；pa11y/HTMLCS 提供互補規則（含 WCAG 技法）。三者皆可離線注入。**引擎以 JS 注入頁面、in-browser 執行（非傳統動態/靜態連結），不適用「動態連結 copyleft」框架；逐引擎履行下列義務即可封裝商用交付**。
- **缺點**：兩套規則需去重/整併。
- **風險**：上游大版本變更 → pin 版本 + 基準站台回歸測試緩解。

### 選項 B：IBMa/equal-access（Apache-2.0）

- **優點**：純 Apache，授權最寬鬆。
- **缺點**：生態與社群採用度不及 axe-core；若無「純 Apache 交付」硬性要求，效益有限。

### 選項 C：僅 axe-core

- **優點**：最單純。
- **缺點**：少了 HTMLCS 的互補規則覆蓋。

---

## 決策（Decision）

採 **選項 A：axe-core（主）+ pa11y / HTML CodeSniffer（互補）**（依使用者確認）。

1. 兩引擎結果**整併去重**後送入 WCAG 對應引擎（見 ROADMAP M2）。
2. 引擎版本 **pin**，建立**基準測試站台 fixtures** 防回歸（呼應 ADR-002 可重現）。
3. **引擎以 JS 注入頁面、in-browser 執行**（非傳統動態/靜態連結）；逐引擎履行授權義務（FC-001 為準）：
   - **axe-core（MPL-2.0）**：不得修改其原始檔且不重新授權；以 **CI 檢查 vendored axe-core 與 pinned release byte-identical**。
   - **pa11y（LGPL-3.0-only）**：以未修改之相依形式封裝，須能提供對應原始碼。
   - **HTML_CodeSniffer（BSD-3-Clause）**：保留版權與授權聲明即可。
4. **誠實涵蓋率（可檢查形式）**：
   - 存在「WCAG 準則 → 自動可判定 / 需人工」對應清單；
   - 報表每條 finding 標註**來源引擎**與**涵蓋類別**；
   - 涵蓋率清單與引擎規則對齊度 **100%**；
   - **不宣稱 100% 合規**；定位為人工檢測輔助。涵蓋率分母與「業界估計非保證」見背景（FC-002）。
5. 若未來客戶有「純 Apache」硬性要求，預留切換 equal-access 的抽象介面（掃描器 adapter）。

---

## 後果（Consequences）

**正面影響：**
- 兼顧權威性（axe-core）與覆蓋互補（HTMLCS）；授權清楚；誠實標示降低法務/期待落差風險。

**負面影響 / 技術債：**
- 結果整併邏輯需維護；兩引擎升級需同步回歸。

**後續追蹤：**
- [ ] M1：axe-core + pa11y 注入與整併。
- [ ] M2：涵蓋率與誠實標示。
- [ ] 掃描器 adapter 介面（為未來 equal-access 切換預留）。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 引擎整併 | 兩引擎結果去重正確 | 基準 fixtures 測試 | M1 |
| 版本可重現 | pin 後結果穩定 | 連續掃描比對 | M1 |
| 誠實涵蓋率 | 「WCAG 準則→自動/人工」對應清單存在；每 finding 標來源引擎與涵蓋類別；清單與引擎規則對齊度 100% | 報表審查 + 清單對齊檢查（FC-002） | M3 |
| axe-core 未改原始檔 | vendored axe-core 與 pinned release byte-identical | CI byte-identical 檢查 | 上線前 |
| 授權合規 | 三引擎授權分列正確（axe-core MPL-2.0 / pa11y LGPL-3.0-only / HTMLCS BSD-3-Clause）、逐引擎義務履行、封裝交付 | 程式碼 + 以更正後事實（FC-001）為基礎之法務檢視 | 上線前 |

---

## 關聯（Relations）

- 參考：ADR-001（技術棧）、ADR-002（pin/可重現）、SRS.md（FR-200/FR-300）、風險：自動化涵蓋率

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
