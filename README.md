# Accessify

**地端、無網際網路（軍用網路）場域的無障礙網頁檢測工具。**

對內網站台執行 WCAG 2.0/2.1（A・AA）自動檢測，產出**繁體中文（台灣）/ 英文（美國）雙語報表**
（HTML / PDF / Excel）。定位為**人工檢測前的自動化輔助**，誠實標示涵蓋率，**不宣稱 100% 合規**。

> 本專案由 [AI-SOP-Protocol (ASP)](https://github.com/astroicers/AI-SOP-Protocol) 治理，採 autopilot
> ROADMAP 驅動開發。設計原則：**穩定優先、離線自足、最少元件、強制 i18n**。

## 設計重點

- **離線**：執行期零對外網際網路請求；Chromium、字型、依賴全部內建打包。
- **穩定**：Docker Compose 單機、pin 版本、可重現建置、可靠的離線升級 + 回滾。
- **簡化**：SQLite + 內嵌佇列（無獨立 DB / Redis）；本地檔案系統儲存報表。
- **i18n**：i18next，僅 zh-TW（預設）/ en-US（fallback），禁 hardcoded 字串。
- **自身無障礙**：本工具的 Web Portal 自身須通過 WCAG 2.1 AA。

## 技術棧

Node.js + TypeScript 全棧 monorepo · Playwright（headless Chromium）+ axe-core + pa11y ·
SQLite（WAL）+ 內嵌佇列 · React 19 + Vite + Tailwind + Radix（visual-web-stack 基礎層）·
報表 i18n HTML → PDF（Playwright print）+ Excel（ExcelJS）· Docker Compose。

決策依據見 [`docs/adr/`](docs/adr/)。

## 文件

| 文件 | 內容 |
|------|------|
| [`ROADMAP.yaml`](ROADMAP.yaml) | Autopilot 任務清單（M0–M7） |
| [`docs/SRS.md`](docs/SRS.md) | 軟體需求規格 |
| [`docs/SDS.md`](docs/SDS.md) | 軟體設計規格（含 API） |
| [`docs/UIUX_SPEC.md`](docs/UIUX_SPEC.md) | UI/UX 規格（含自身無障礙硬規格） |
| [`docs/DEPLOY_SPEC.md`](docs/DEPLOY_SPEC.md) | 地端離線部署 / 備份 / 升級回滾 |
| [`docs/adr/`](docs/adr/) | 架構決策記錄（ADR-001~007） |

## 開發狀態

初始化中（governance bootstrap）。實作由 ASP autopilot 在 ADR 經人類核准後逐任務進行。
常用指令見 `make help`。
