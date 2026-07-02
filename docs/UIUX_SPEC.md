# UI/UX 規格書 (UI/UX Specification)

| 欄位 | 內容 |
|------|------|
| **專案名稱** | Accessify |
| **版本** | v0.1.0 |
| **最後更新** | 2026-06-24 |
| **狀態** | Draft |
| **前端負責人** | （待指派） |
| **關聯** | SRS.md 第 8 節、ADR-005、ADR-004 |

> **核心原則：本產品是無障礙工具，其 UI 自身必須通過 WCAG 2.1 AA（第 5 節為硬規格）。**
> 技術棧整合依 `visual-web-stack` 基礎層；i18n / a11y / 三態驗證以 ASP `frontend_quality` profile 為準。

---

## 1. Design System

### 1.1 技術基礎（ADR-005）

- React 19 + Vite + TypeScript、Tailwind CSS、**Radix UI**（無障礙元件基礎）、Motion（克制）、Zustand、next-themes。
- **不使用** R3F/3D、Lenis/GSAP 滾動物理。
- 風格取向：clean、資料導向、高對比、低裝飾（適合內網管理工具）。

### 1.2 色彩（需通過對比，見第 5.2 節）

採語意化 token（primary / success / warning / danger / neutral）+ 深淺色（next-themes）。所有前景/背景組合須 ≥ WCAG AA。實際 token 於 `src/styles/tokens.css` 維護並逐一驗證對比。

### 1.3 字型（離線，ADR-002）

- 拉丁在前、CJK 在後：`'Inter', 'Noto Sans TC', system-ui, sans-serif`。
- **本地子集化 woff2 + `provider: none`，不接 Google Fonts / 任何 CDN**。UI 介面文字可使用子集化字型。
- 報表/PDF 路徑：**必須內嵌「完整（非子集）」Noto Sans TC**，因報表為動態使用者內容（任意網址、頁面標題、CJK 字元），子集化會造成缺字；UI 子集與報表完整字型分開管理。

### 1.4 元件庫（以 Radix 為基礎客製）

| 元件 | 優先級 | 用途 |
|------|--------|------|
| Button / Input / Select | P0 | 全站，含錯誤/disabled/loading 狀態 |
| DataTable | P0 | 掃描清單、問題清單（排序/分頁/鍵盤導航） |
| Dialog / Toast | P1 | 確認、操作反饋（遵守 reduced-motion） |
| Sidebar / Topbar | P1 | 導航 + 語言切換 + 主題切換 |
| LanguageSwitcher | P0 | zh-TW / en-US |

---

## 2. 頁面與導航（對應 SRS 8.1）

```
/login                     登入（Guest）
/                          Dashboard：最近掃描、站台分數摘要
/scans/new                 建立掃描任務（admin）
/scans/:id                 掃描結果：問題清單 + WCAG 對應 + 嚴重度 + 涵蓋率標示
/reports                   報表清單與下載（HTML/PDF/Excel × zh-TW/en-US）
/settings                  系統設定（admin）：白名單/速率/語言/排程/SMTP
/admin/users               帳號管理（admin）：建帳/角色/停用/重設密碼；一次性密碼僅顯示一次（aria-live 播報 + 複製）
/change-password           變更密碼（Authenticated；mustChange 時為強制導向 gate，完成前不渲染其他頁）
/status                    本地健康/狀態頁（Authenticated）
```

全站 header 常駐：語言切換、主題切換、使用者選單。

**`/status`（本地健康/狀態頁，ADR-011）**：純內網、無外網依賴，呈現 worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期剩餘天數；磁碟/憑證達閾值時以站內告警（`aria-live` 通知，遵守第 5.4 節）顯示，不對外發送。畫面以卡片式儀表呈現各指標，異常項目以 danger/warning 語意色標示並符合對比規範。

---

## 3. 關鍵畫面

- **建立掃描（/scans/new）**：URL/sitemap 輸入、白名單驗證提示、語言/格式預設；送出後導向結果頁並顯示佇列狀態。
- **掃描結果（/scans/:id）**：頂部站台分數 + **涵蓋率誠實標示**（自動涵蓋 vs 需人工）；問題以 DataTable 呈現（嚴重度、WCAG 準則、選擇器、訊息、修正建議），可篩選/排序；空狀態與失敗頁註記。
- **報表（/reports）**：依任務列出可下載檔（格式 × 語言）。

---

## 4. 響應式

桌機優先（內網工作站）；平板可用。Breakpoints 採 Tailwind 預設。DataTable 在窄螢幕橫向捲動；導航於窄螢幕收合為抽屜（鍵盤可達）。

---

## 5. 無障礙標準（硬規格 — 本產品自身）

### 5.1 目標
- **WCAG 2.1 AA**（最低）；測試：axe DevTools、Lighthouse、鍵盤、NVDA（Windows）、VoiceOver（macOS）。

### 5.2 色彩對比
- 一般文字 ≥ 4.5:1、大型文字 ≥ 3:1、UI 元件/狀態 ≥ 3:1。**所有 token 組合須逐一驗證並記錄**。

### 5.3 鍵盤導航
- 所有互動元素可由鍵盤操作；Tab 順序符合視覺順序；**focus 樣式可見（禁 `outline:none`）**。
- Dialog 開啟 focus 移入、關閉 focus 返回觸發元素；Dropdown/Table 方向鍵導航、Esc 關閉。

### 5.4 Screen Reader
- 語意 HTML 優先（`<button>/<nav>/<main>/<table>`）；ARIA 僅補語意不足處。
- 圖示按鈕須 `aria-label`；裝飾圖片 `alt=""`；動態更新用 `aria-live`（錯誤 assertive、一般 polite）。
- 表格有 `<caption>`/表頭 scope。

### 5.5 表單
- `<label for>` 綁定；錯誤以 `aria-describedby` 連結、`role="alert"`；`aria-invalid` 於錯誤時。

---

## 6. 動畫與互動

- Transition 短而克制（hover/dialog/toast）；**僅動 transform/opacity**，不動 layout 屬性。
- **`prefers-reduced-motion: reduce`（硬規格）**：
  - 全域 CSS 兜底：`@media (prefers-reduced-motion: reduce)` 將 `animation-duration` / `transition-duration` 強制歸零（含 `!important`），作為任何元件遺漏時的最後防線。
  - Motion 層級：以 `<MotionConfig reducedMotion="user">` 包裹應用，讓所有 Motion 動畫尊重使用者系統偏好；Radix + Motion 的 exit 動畫須一併遵守。
  - 列為 **T501 / T007 驗收項目**（自動化 a11y/e2e 測試須驗證 reduced-motion 下無非必要動畫）。
- 反饋：成功 toast（3s）、錯誤 toast + 行內訊息、破壞性操作需確認 Dialog。
- 載入：Skeleton / 按鈕 spinner（防重複提交，保留版位）。

---

## 附錄
- Token 來源：`src/styles/tokens.css`、`tailwind.config.ts`
- 變更歷史：v0.1.0（2026-06-24）初版建立
- 相關：[`SRS.md`](./SRS.md)、[`SDS.md`](./SDS.md)、ADR-004/005
