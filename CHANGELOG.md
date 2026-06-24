# Changelog

本檔遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本採 [語意化版本](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added
- **M5/T501**：前端 scaffold（ADR-005 / visual-web-stack 基礎層）`@accessify/web`：React 19 + Vite 6 + Tailwind v4 + react-i18next（共用 shared catalog，zh-TW/en-US，持久化偏好不被 Accept-Language 凌駕）+ next-themes + zustand；Layout（skip-link、語言/主題切換、可見 focus）、typed API client、reduced-motion 全域兜底。`vite build` production 綠（58 modules）、`tsc --noEmit` 綠。移除 3D/滾動層（自身 a11y/穩定）。
- **M5/T502**：REST API（ADR-001 / FR-206）`@accessify/api` Fastify server：`/healthz`、`/api/openapi.json`（OpenAPI 契約）、auth login/logout（session cookie + Bearer）、scans 列表/建立(白名單+入列)/詳情/issues/reports、settings；session 中介層 + RBAC 守衛（admin/viewer）+ route schema 驗證 + 稽核。以 `fastify.inject` 測試（401/403/201/白名單）。
- **M5/T503**：本地帳號 + RBAC + session + 登入鎖定（ADR-006 / FR-101~104）`@accessify/api`：bcryptjs（cost 12）hash/verify、`createUser`、`authenticate`（失敗累計鎖定）、server-side session（token 雜湊）、`hasRole`（admin 可 view）。core 遷移 0002 新增 sessions 表 + 鎖定/強制改密欄位（expand-contract）。
- **M5/T506**：首位 admin 離線 bootstrap（ADR-006）`ensureAdmin`：無 admin 時建立；未提供密碼則產生一次性隨機密碼並強制首登改密；嚴禁固定預設。
- **M4 任務佇列與背景 Worker（T401–T403，完成）** `@accessify/core`：
  - T401 內嵌佇列（FR-206）：`enqueueJob`/`claimJob`（原子領取）/`heartbeat`/`completeJob`/`failJob`（重試）/`reclaimExpired`（孤兒回收）；lease/heartbeat 續接。
  - T402 狀態機+稽核（FR-104）：`setScanTaskStatus`（合法轉移驗證）、`writeAudit`；`processNextJob`/`runWorker`（DI、單頁/單任務失敗隔離）。
  - T403 報表觸發+儲存（FR-404）：`saveReport`（寫本地 volume + reports 表）。
  - **端到端實證**：enqueue → worker → scan → map(severity) → persist 8 issues → 產 6 雙語報表（zh-TW/en-US × html/xlsx/pdf）→ 儲存 → scan_task completed + 稽核。
- **M3 雙語報表引擎（T301–T303，完成）** `@accessify/report`：i18n 報表資料模型 + chrome 走 shared i18next（zh-TW/en-US）。
  - T301 HTML（FR-401）：`renderHtmlReport()`，含涵蓋率誠實標示；不可信內容一律 HTML 轉義（防 XSS）。
  - T302 PDF（FR-402）：`htmlToPdf()`（Playwright print，CJK 完整字型由映像提供）。
  - T303 Excel（FR-403）：`renderExcel()`（ExcelJS，summary + 問題清單 + 可追蹤 Status 欄）。
  - 實證：fixture 報表 → HTML 1.8KB（含「嚴重」「27%」）、XLSX 7.7KB（2 sheets）、PDF 167KB（%PDF）。
- 修正：shared i18n JSON 匯入加 `with { type: 'json' }`（Node ESM 執行期必需）；vitest 加 workspace src alias。
- **M2 WCAG 對應引擎（T201–T203，完成）** `@accessify/mapping`：
  - T201 規則碼→WCAG（FR-301）：`WCAG_CRITERIA` 33 條 A・AA 準則參考表（等級/涵蓋類別/雙語名稱）、`toSuccessCriterion()`、`resolveCriterion()`、`mapTagsToCriteria()`。
  - T202 嚴重度+分數（FR-302）：`severityOf()`（impact 優先，HTMLCS 無 impact 依等級推估 A→高/AA→中）、`scoreSite()`（0–100 加權扣分，確定性）。
  - T203 誠實涵蓋率（FR-303）：`coverageSummary()`（自動 27% / 自動+部分 79%，刻意 <100%）、`COVERAGE_NOTE`（雙語誠實聲明，不宣稱完整合規）。
- **M1/T104**：URL/sitemap 探索 + 逐頁掃描編排 + 入庫（FR-204）— `@accessify/scanner` `parseSitemap()`/`buildTargets()`、`scanUrl()`（egress 強制渲染 + 雙引擎 + 整併）、`scanSite()`（頁數上限、單頁失敗隔離、結構化輸出）；`@accessify/core` `persistScan()`（寫入 pages/issues）。**M1 掃描核心完成（T101–T104）**。端到端驗證：fixture → render → axe+htmlcs → 8 deduped → SQLite 1 page / 8 issues。
- **M1/T103**：第二引擎 HTML CodeSniffer + 整併去重（ADR-007 / FR-203）— `runHtmlcs(page)`（HTMLCS BSD-3-Clause 未修改注入 build/HTMLCS.js、WCAG2AA、取 Error）、`normalizeHtmlcs()`；`mergeFindings()` 依 WCAG SC + selector 跨引擎去重並記錄 engines；`toSuccessCriterion()` 正規化 axe/HTMLCS WCAG 形式。真實驗證：golden fixture axe 4 + htmlcs 5 → 8 deduped，html-has-lang 由兩引擎共同回報並正確合併。
- **M1/T102**：axe-core 注入 → raw findings（ADR-007 / FR-202）— `@accessify/scanner` `runAxe(page)`（axe-core MPL-2.0 未修改注入、withTags wcag2a/2aa/21a/21aa）、`normalizeAxe()`（攤平 violations×nodes，取 ruleId/impact/wcagTags/selector/message/helpUrl）。真實驗證：golden fixture 掃出 4 筆 WCAG findings（button-name/html-has-lang/image-alt/label），clean fixture 0 筆。
- **M1/T101**：掃描渲染 + 出站安全（ADR-009 / FR-201/205）— `@accessify/scanner`：`egress` 白名單/SSRF 政策（每出站請求校驗、redirect/子資源、loopback/link-local/metadata/0.0.0.0 一律封鎖、禁非 http(s)、私有 IP 須白名單）、`renderPage`（Playwright headless + route 攔截強制 egress + 資源上限）。Chromium 真實渲染已驗證（page.evaluate 偵測 golden fixture 已知問題）。
- **M0/T006**：i18n key-diff CI 閘（ADR-004）— `key-diff.test.ts`（zh-TW/en-US key 集合完全一致，CI 強制）；`no-literal-string` 收緊為 **error**（web/api 層）。
- **M0/T007**：a11y/e2e 測試框架（ADR-005）— `@playwright/test` + `@axe-core/playwright`、`playwright.config.ts`（locale zh-TW、TZ Asia/Taipei）、`e2e/a11y.spec.ts`（WCAG 2.1 AA 驗收骨架，M5 啟用）、`make e2e`。**M0 完成（T001–T007）**。
- **M0/T004**：base Docker 映像（ADR-002/009）— `Dockerfile`（node:22、內建 Noto CJK 字型、tini PID1 reaping、非 root、Chromium OS 函式庫、TZ=Asia/Taipei、`npm ci` lockfile pin）、`.dockerignore`、`scripts/build-image.sh`、`scripts/vendor-offline.sh`；結構測試守住 air-gap 規則；`docker build --check` 無警告（實際 image build 屬 CI/現場步驟）。
- **M0/T005**：CI 品質門檻 + 基準站台 fixtures — `.github/workflows/ci.yml`（lint/build/test）；`test/fixtures/{with-violations,clean}.html` golden 站台供 M1/M2 掃描回歸。
- **M0/T003**：SQLite schema + 版本化遷移 + 內嵌佇列（ADR-003）— `@accessify/core` `openDb()`（WAL / foreign_keys / busy_timeout 5000ms）、`runMigrations()`（schema_version、單一交易、冪等、expand-contract）；schema 含 users/scan_tasks/jobs/pages/issues/reports/audit_logs/settings；`jobs` 含 state + lease/heartbeat 欄位（跨程序並發續接）。
- **M0/T002**：i18n 基礎框架 — i18next + zh-TW/en-US catalog（`packages/shared/locales/`）、`createI18n()`、`resolveLocale()`（優先序：持久化 > ?lang > 預設 zh-TW，Accept-Language 不凌駕，ADR-004）、`isLocale()` 型別守衛；`eslint-plugin-i18next` no-literal-string（web/api 層 warn，T006 收緊為 error + CI key-diff）。
- **M0/T001**：monorepo 骨架與工具鏈 — npm workspaces（7 packages：shared/core/scanner/mapping/report/api/web）+ TypeScript（composite project references）+ ESLint 9 flat + Prettier + Vitest；版本以 `package-lock.json` pin。`@accessify/shared` 提供語系常數（zh-TW/en-US，ADR-004）與 TDD 煙霧測試；`make test` 通過時寫入 ASP ship 痕跡。
- ASP 治理骨架：`.ai_profile`（autonomous + autopilot）、`CLAUDE.md`（場域鐵則）、`.claude/settings.json`、`.gitignore`。
- 前置文件：`docs/SRS.md`、`docs/SDS.md`、`docs/UIUX_SPEC.md`、`docs/DEPLOY_SPEC.md`。
- 架構決策記錄 ADR-001~007（狀態 Draft，待人類核准）。
- `ROADMAP.yaml`：autopilot 任務清單，8 個 milestone（M0–M7）、30 個任務。
- 由原 SaaS 設計改寫為地端、無網際網路、穩定優先、強制 i18n（zh-TW/en-US）。

### Changed（對抗式審查後強化）
- 經多代理人審查（60 條確認 finding）後強化：新增 ADR-008（內網 TLS/secrets）、ADR-009（Chromium sandbox + 掃描器出站安全）、ADR-010（離線時間/排程）、ADR-011（資料保留/磁碟/可觀測）。
- 更正第三方引擎授權標示：axe-core MPL-2.0、pa11y LGPL-3.0-only、HTML_CodeSniffer **BSD-3-Clause**（先前誤標 LGPL）；查證紀錄於 `.asp-fact-check.md`。
- 修正 ROADMAP DAG（T403 milestone 倒置）並補缺漏任務：i18n CI 閘、a11y/e2e harness、admin bootstrap、資料保留、TLS 佈建、狀態頁。
- 修正 SQLite 雙寫程序並發策略（busy_timeout）、WAL 一致性備份、離線原生模組建置等多項穩定性與安全缺口。

## [0.1.0] - 2026-06-24
- 專案初始化。
