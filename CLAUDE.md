# Accessify — AI 行為設定

> ASP v5｜讀取順序：本檔案 → `.asp-compiled-profile.md`（asp-compile 編譯產物，檔頭列來源清單；
> 不存在則依 `.ai_profile` 載入散文 profile 為 fallback）→ `~/.claude/CLAUDE.md`（user-level 鐵則）
> Profile 邏輯與 ASP skills 詳見 `~/.claude/asp/profiles/` 與 `~/.claude/skills/asp/`

## 專案說明

**Accessify** 是一套**地端、無網際網路（軍用網路）場域**的**無障礙網頁檢測工具**。對內網站台執行
WCAG 2.0/2.1（A・AA）自動檢測，產出**繁體中文（台灣）/ 英文（美國）雙語報表**（HTML / PDF / Excel），
定位為**「人工檢測前的自動化輔助」，誠實標示涵蓋率，不宣稱 100% 合規**。

技術棧（見 `docs/adr/`、`ROADMAP.yaml`）：Node.js + TypeScript 全棧 monorepo、Playwright（headless
Chromium）+ axe-core + pa11y、SQLite + 內嵌佇列、本地檔案系統報表、React + Vite 本地 Web Portal、
Docker Compose 單機部署。

## 場域鐵則（本專案專屬，覆蓋/補強 user-level 預設，不可違反）

| 鐵則 | 說明 |
|------|------|
| **地端離線（軍網）** | 執行時**禁止任何對外網際網路請求**：禁 CDN、外部字型、telemetry、外掛分析、雲端 SDK。依賴一律**離線 vendoring**、字型/瀏覽器**內建打包**。違反即重寫（見 ADR-002）。 |
| **強制 i18n** | **禁止 hardcoded 使用者可見字串**（UI、API 訊息、報表、錯誤訊息）。一律走 i18next key；語言僅 **zh-TW / en-US**，預設 zh-TW，fallback en-US。lint 強制（見 ADR-004）。 |
| **穩定優先** | 進場修復/更新申請時間長 → 元件越少越好。**pin 所有版本（lockfile）**、可重現建置、可靠的**離線升級 + 回滾**流程。新增執行期相依/服務前須有 ADR。不過度設計（見 ADR-002）。 |
| **本產品自身須無障礙** | 本工具的 Web Portal 自身必須通過 **WCAG 2.1 AA**：語意 HTML、鍵盤可達、對比達標、`prefers-reduced-motion`、screen reader 友善。不得用 3D/重動畫破壞可及性（見 ADR-005）。 |

## 標準工作流

```
需求 → [ADR 建立/核准] → SDD 設計 → TDD 測試 → 實作 → 文件同步 → 確認後部署
         ↑ 架構影響時必須（Draft ADR 禁止實作）   ↑ 預設行為
```

## autopilot 注意事項

- `ROADMAP.yaml` 為任務主檔；`docs/{SRS,SDS,UIUX_SPEC,DEPLOY_SPEC}.md` 為前置文件。
- 引用 ADR 的任務，**該 ADR 必須先升 `Accepted`（或附證據的 `FIRM`）**，否則 autopilot 會 block 該任務。
- HITL = standard：每任務實作前暫停讓人審；TDD / 驗證 / auto-PR 仍自動。

## 常用指令

完整 ASP 指令見 `make help` 或 `~/.claude/skills/asp/SKILL.md`。常用：`/asp-plan`、`/asp-gate`、
`/asp-ship`、`/asp-autopilot`、`/asp-audit`、`/asp:approve-adr <NNN>`。
