# [ADR-005]: 前端技術棧與自身無障礙

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

前端/UI 要求**盡可能採用 `visual-web-stack` skill**。但 Accessify **自身是無障礙檢測工具**，其 Web Portal 必須示範性地通過 WCAG 2.1 AA。`visual-web-stack` 的 3D 層（R3F/Drei/postprocessing）與滾動物理層（Lenis/GSAP ScrollTrigger）對無障礙（鍵盤、screen reader、`prefers-reduced-motion`）與穩定性（離線打包、低資源）不利，且本產品為資料型管理介面而非視覺敘事網站。

---

## 評估選項（Options Considered）

### 選項 A：採 visual-web-stack「基礎層」，移除 3D / 滾動物理

- **優點**：保留 React 19 + Vite + TS + Tailwind + Radix UI + Motion + Zustand + next-themes 的整合知識與鐵則；移除對 a11y/穩定不利的層；強制 `prefers-reduced-motion`；UI 可達 WCAG-AA。
- **缺點**：不使用 visual-web-stack 全部能力（但本產品本就不需要 3D 敘事）。
- **風險**：低。

### 選項 B：完整採用 visual-web-stack（含 3D + 滾動敘事）

- **優點**：視覺強。
- **缺點**：與本產品無障礙自我要求、穩定優先、離線打包**直接衝突**；Canvas/重動畫是 a11y 反模式。

### 選項 C：完全不用 visual-web-stack，自訂前端

- **缺點**：放棄既有整合知識與鐵則，重造輪子。

---

## 決策（Decision）

採 **選項 A：visual-web-stack 基礎層子集**（依使用者確認）。

採用：
- **React 19 + Vite + TypeScript**、**Tailwind CSS**、**Radix UI**（無障礙元件基礎）、**Motion（motion/react）**克制使用、**Zustand**（狀態）、**next-themes**（深淺色）。
- 字型**本地子集化 woff2 + `provider: none`**（離線，呼應 ADR-002/004）。

明確移除/禁止：
- **R3F / Drei / @react-three/postprocessing**（3D 層）。
- **Lenis / GSAP ScrollTrigger** 滾動物理/敘事。
- 任何破壞鍵盤可達或忽略 `prefers-reduced-motion` 的動畫。

自身無障礙硬規格（見 UIUX_SPEC 第 5 節）：語意 HTML、完整鍵盤操作、focus 可見、對比 ≥ AA、Radix + Motion 的 exit 動畫遵守 reduced-motion、screen reader（NVDA/VoiceOver）驗證。

**reduced-motion 強制機制（可驗收）：** 不僅「應遵守」，而是雙層兜底強制——

- 全域 CSS `@media (prefers-reduced-motion: reduce)` 將所有 `animation`/`transition` 的 duration 歸零兜底（涵蓋第三方未自行處理的動畫）。
- 以 Motion 的 `MotionConfig reducedMotion="user"` 全域包裹整個應用，讓 Motion 動畫一致依使用者系統偏好降級。

此機制列為 T501 / T007 驗收項目。

> 技術棧整合細節依 visual-web-stack 鐵則；**i18n / a11y / 三態驗證以 ASP `frontend_quality` profile 為準**。

---

## 後果（Consequences）

**正面影響：**
- 工具自身即無障礙範例；介面穩定、輕量、離線可打包。

**負面影響 / 技術債：**
- 視覺表現較樸實（對內網工具屬合理取捨）。

**後續追蹤：**
- [ ] M5：前端 scaffold（基礎層）+ 語言切換 + reduced-motion + 自身 a11y 驗收。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| Portal 自身 a11y（自動部分） | axe 自動掃描 0 violations（自動可判定部分） | axe 自動掃描 | M5 |
| Portal 自身 a11y（手動部分） | 手動 a11y 檢核清單（鍵盤可達、focus 可見、對比、reduced-motion、SR 朗讀指定核心流程）逐項通過，並記錄 SR 名稱/版本 | 手動檢核清單 | M5 |
| 無 3D/滾動物理依賴 | package.json 無 R3F/Lenis/GSAP | 相依檢視 | M5 |
| reduced-motion | 全域 CSS `@media (prefers-reduced-motion: reduce)` duration 歸零兜底 + Motion `MotionConfig reducedMotion="user"` 全域包裹；開啟時動畫停用 | 手動 + 自動測試 | M5 |
| 離線字型 | 無外部字型請求 | 斷網載入測試 | M5 |

> **註：** axe 自動掃描 0 violations 僅代表「自動可判定部分」通過，**不等於完整 WCAG 2.1 AA**；完整 AA 仍需上述手動檢核清單佐證（與 ADR-007 誠實涵蓋率立場一致）。

---

## 關聯（Relations）

- 參考：ADR-002（離線字型）、ADR-004（i18n）、UIUX_SPEC.md、visual-web-stack skill、frontend_quality profile

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
