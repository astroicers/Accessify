# Changelog

本檔遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本採 [語意化版本](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [1.0.0] - 2026-06-25

> 首個完整交付：地端離線（軍網）無障礙網頁檢測工具，M0–M7 共 8 milestone / 36 任務全數完成。
> 掃描核心（Playwright + axe-core + HTML_CodeSniffer）→ WCAG 對應與誠實涵蓋率 → 雙語報表（HTML/PDF/Excel）→
> 本地 Web Portal（自身 WCAG 2.1 AA）→ 排程/差異/站內通知 → 單機 compose 交付（離線包、備份/還原、升級/回滾、資料保留、內網 TLS）。

### Added
- **🎉 專案完成（M0–M7 全 8 milestone、36 任務）**：地端離線無障礙檢測工具，自掃描核心 → WCAG 對應 → 雙語報表 → 本地 Web Portal → 排程/差異/通知 → 地端交付/備份/升級/回滾，端到端可運行（in-proc e2e 實證：真實 Chromium 掃描 → 中文 PDF）。
- **M7/T705**：資料保留與磁碟治理（ADR-011 / FR-603）`@accessify/core` `retention.ts` `runRetention`：刪除逾 `RETENTION_DAYS` 且已結束（completed/failed）的掃描 → FK CASCADE 清 pages/issues/reports/notifications + `rmSync` 報表檔 + `wal_checkpoint(TRUNCATE)` 收斂 -wal（`julianday` 比較避格式陷阱、只刪已結束、停用時仍 checkpoint）。worker/main.ts 每日 tick（`RETENTION_DAYS` 預設 0=停用、`RETENTION_TICK_MS`）。單元測試。日誌輪替交由容器 logging driver。
- **M7/T706**：內網 TLS 憑證佈建與輪替（ADR-008）`install.sh` 首啟產自簽（過渡）；`rotate-tls.sh` 輪替（**key-agnostic 公鑰相符檢查**，RSA/EC/Ed25519 皆適用；force-recreate api）；`collectStatus` 以 `node:crypto` X509 讀 notAfter → `GET /api/status` `tls.daysRemaining`，低於門檻(14d) 轉 degraded（僅讀本地憑證、零對外、不洩漏路徑）；狀態頁 TLS 列 + i18n；RUNBOOK §7。單元測試涵蓋有效/近到期/過期/缺檔。**M7 地端交付與穩定性完成（T701–T706）**。
- **驗證（M7/T705+T706）**：`tsc -b`/`vite build`/lint 綠、112 unit tests（+retention、+status TLS）、shellcheck 全 .sh clean、`node --check` .mjs；`node scripts/a11y-check.mjs`（committed 可重現）全 Portal 頁面 × zh-TW/en-US × light/dark **0 WCAG 2.1 AA violations**；`node scripts/smoke-inproc.mjs`（真實 Chromium e2e + 中文 PDF）。對抗式 review（16 agents / 確認 7 項皆 MED/LOW）後修：rotate-tls 公鑰比對相容 EC、補 status TLS 測試、RUNBOOK/DEPLOY_SPEC 保留文件對齊、a11y 提交可重現腳本。
- **M7/T702+T703+T704**：離線交付包 + 備份/還原/升級/回滾 + 部署驗收（ADR-002/003/008/011）。
  - **T702 離線包**：`package-offline.sh`（build → `docker save` gzip + 打包 compose/scripts/docs）、`install.sh`（`docker load` → 產生 0600 機密：`openssl` cookie 簽章金鑰 + 自簽 TLS → `compose up` → 等健康 → 提示一次性 admin 密碼）、`verify.sh`（healthz / OpenAPI 契約 / SPA 首頁 / 選用登入）。`Dockerfile` runtime 階段 `COPY` db-backup/verify helper。
  - **T703 備份/還原/升級/回滾**：`scripts/db-backup.mjs`（better-sqlite3 **Online Backup API**，對使用中 WAL 庫取一致快照，**絕不 cp 主檔**）+ `db-verify.mjs`（`quick_check`）；`backup.sh`（容器內快照 + `docker cp` reports + secrets → tar，含 MANIFEST schema 版本）、`restore.sh`（還原前驗證、一次性容器寫回 named volume）、`upgrade.sh`（**升級前強制備份失敗即中止**、記錄前一版 tag、expand-contract 遷移、等健康）、`rollback.sh`（**一鍵**：相容=切回映像 tag／不相容=還原備份+切回）。`docs/RUNBOOK.md`（含遷移相容性標記表）。**備份機制以單元測試 round-trip 實證**（integrity ok + 資料/schema 完整）。
  - **T704 驗收**：`docs/ACCEPTANCE.md`（A 管線/B 部署/C 穩定/D 離線安全/E 現場斷網演練腳本），誠實標示 ✅本環境已實證 vs 🟡需現場 docker。
  - 驗證：`tsc -b`/`vite build`/lint 綠、**107 unit tests**（+備份 round-trip）、**shellcheck 全 .sh clean**、`node --check` .mjs 通過。對抗式 review（見下）。`scripts/**` 納入 eslint ignore（維運腳本，改由 shellcheck/node --check 驗證）。
  - 誠實邊界：本環境無 docker daemon → `docker build`/`compose up`/斷網/重啟存活屬**現場勾稽**（已附可執行腳本+步驟）；核心管線、備份機制、egress、a11y 已實證。
- **M7/T701**：生產 entrypoint + 單機 docker-compose（ADR-002/003/009）。**補上先前缺漏的可執行進場**：
  - 新套件 `@accessify/worker`（組合根）：`makeRunJob` 真實串接 scanner→mapping→report→core（讀 scan_task → egress 白名單掃描 → 嚴重度/分數/誠實涵蓋率 → `persistScan` → zh-TW/en-US × html/pdf/xlsx 六報表 → `saveReport`）；sitemap 以 egress-checked `resp.text()` 取原始 XML 解析；`buildReports` **冪等**（重跑前清前次 pages/issues/reports，解 retry 重複入庫）、可注入 toPdf 單元測試。`worker/main.ts`（`runWorker` + 排程 tick + liveness 心跳檔）。
  - `@accessify/api` `main.ts`：openDb→runMigrations→ensureAdmin（一次性密碼）→buildServer→listen；**同容器靜態服務 web SPA（dep-free、path-safe，不引入 @fastify/static 免新增相依）**、TLS（cert/key 檔）、cookie 簽章金鑰（ADR-008）；secrets 缺檔時降級 HTTP/未簽章而非崩潰。`server.ts` 加 `webDir`/`https`/`cookieSecret`（https 於執行期附掛，保持 instance 型別）。
  - `docker-compose.yml`（api+worker 共用 data/reports volume，WAL 雙寫 ADR-003；worker init/shm Chromium 硬化 ADR-009；api+worker `no-new-privileges`；api `/healthz` + worker 心跳 healthcheck）、`.env.example`（僅列實際讀取變數，機密走 0600 檔）、`Dockerfile`（啟用 Chromium 安裝、`mkdir+chown /data /reports` 解 non-root 空 volume EACCES）、`.gitignore` 加 `/secrets/`。
  - **實證**：in-proc 端到端（真實 chromium 掃 fixture → 8 issues → 6 雙語報表含 **181KB 中文 PDF**；同 task 重跑 **冪等**不重複）。`tsc -b`/`vite build`/lint 綠、106 unit tests（+worker buildReports）。對抗式 review（30 agents）確認 16 項，已修全部 CRITICAL/HIGH/MEDIUM + 划算 LOW（volume 權限、SPA 未服務、retry 重複入庫、secrets 缺檔崩潰、worker healthcheck、no-new-privileges、render 去重）。
  - 現場/CI 步驟：`docker build`/`docker save`、`compose up`、TLS/secrets 由 `install.sh` 產生（T702）；base image @sha256 digest pin 留交付建置。
- **M6/T603**：站內通知（FR-503）`@accessify/core` migration v4 `notifications` 表 + `notifications.ts`（`notify`/`listNotifications`/`unreadCount`/`markRead`/`markAllRead`，全程以 `user_id` 範圍化、參數化查詢）。訊息存 i18n key + params_json，**顯示時依使用者語系渲染**（不存在地化字串）。觸發點（皆 fault-isolated，絕不影響掃描結果）：掃描完成 → 通知發起者（並 `computeDiff`，新問題 >0 再通知數量）、失敗 → 通知、排程觸發 → 通知建立者。`@accessify/api` 四路由（list / unread-count / :id/read / read-all，全 `requireAuth` + 僅本人）。`@accessify/web` `/notifications` 頁（渲染訊息 + 標記已讀/全部 + 連到掃描 + 標記後移焦與 `role=status` 播報）+ 導覽未讀指示（文字+數字、`aria-label`、60s 本地輪詢、`useNotify` store 共享）。**SMTP 外送刻意延後（待 ADR-012）**：屬新執行期相依 + 新出站路徑，依鐵則須先有 ADR；站內通知零新相依、air-gap 安全。**M6 排程重掃與變更追蹤完成（T601–T603）**。
- **驗證（M6/T603）**：`tsc -b`/`vite build`/lint 綠、105 unit tests（+notifications core/worker-notify/api-scope）；a11y 實證 Notifications + 導覽徽章（zh-TW/en-US × light/dark）0 violations。對抗式 review（27 agents）確認 6 項（無 critical/high），已修：scheduler `notify` 移出 rollback 路徑（try/catch，避免緊湊重觸發）、Notifications 標記後移焦（WCAG 2.4.3）+ `role=status` 播報（4.1.3）。
- **M6/T601**：週期重掃排程器（ADR-010 / FR-501）`@accessify/core` migration v3 `schedules` 表 + `scheduler.ts`（`dueSchedules`/`runSchedulerTick`，純函式、注入時鐘、`julianday()` 數值比較避免 ISO-T/datetime 格式陷阱、原子認領防重複觸發、同 target 進行中即跳過防 enqueue 風暴、無 catch-up backfill 容忍時鐘回跳）。`next_run_at` 為到期判斷唯一真相並對齊 `idx_schedules_due`。排程 tick 內嵌**既有單一 worker 迴圈**（不另開程序、不用 node-cron，ADR-010；長駐入口於 M7 佈建）。`@accessify/api` schedules CRUD（admin；間隔界線 300s–1y、白名單檢查、唯一 target 409）+ list（viewer 可讀）。`@accessify/web` `/schedules` 頁（admin）。
- **M6/T602**：掃描差異比對（FR-502）`@accessify/core` `diff.ts` `computeDiff`（穩定 key = 頁面 URL+WCAG+規則碼+selector，`JSON.stringify` 串接避免分隔字元碰撞；baseline = 同 target 前次 completed）。`GET /api/scans/:id/diff`（requireAuth，baseline 由後端決定防跨 target 列舉）+ ScanResult 差異區塊（已修復/新增/未改計數 + 誠實標示「selector 可能因改版變動」）。
- **M6 範圍決策（誠實）**：T603 內網 SMTP 會引入新執行期相依（如 nodemailer）+ 新出站路徑 → 依鐵則「新增執行期相依須先有 ADR」，故 SMTP **延後待 ADR-012**；T603 站內通知（零新相依）於下一迭代實作。
- **驗證（M6/T601+T602）**：`tsc -b`/`vite build`/lint 綠、102 unit tests（+scheduler 3、diff 3、server 2、runWorker 整合 2）；a11y 實證 Schedules + ScanResult 差異 zh-TW/en-US × light/dark 0 violations。對抗式多代理人 review（28 agents）確認 10 項（皆 LOW/NIT），已修 next_run_at 唯一真相一致性、diff 確定排序、Schedules 錯誤處理、worker 整合測試覆蓋、術語/時間顯示等；並於提交前自查修掉 `diff.ts` 內誤植的 NUL byte 分隔字元。
- **M5/T507**：本地健康/狀態頁（ADR-011 / FR-602）`@accessify/api` `GET /api/status`（viewer+，admin 超集）：純函式 `collectStatus`（與 HTTP 解耦、可測）彙整 queue（依 job state）、oldest queued age、worker 心跳延遲、過期租約、DB `quick_check` integrity + schema 版本、磁碟用量（`statfs` 派生 usedPct/free/total）、uptime、node/app 版本；衍生 `overall` healthy/degraded/down（內建閾值，站內呈現、零對外）。**僅輸出派生值，不洩漏絕對路徑/主機清單/密鑰**（ADR-008/009/011）。`@accessify/web` `/status` 頁（語意 `<dl>` 分組 + refresh）。
- **M5/T505**：設定頁（ADR-006 / FR-601）`@accessify/web` `/settings`（admin only，非 admin 顯示 `error.forbidden`）：scan_whitelist 編輯（每行一主機、`role=status` 儲存回饋）。**強化 `PUT /api/settings`**：允許鍵白名單（防注入任意 settings 列）+ 主機格式驗證（拒 scheme/port/path/萬用字元/loopback/link-local；正規化儲存），稽核僅記鍵名不記值。誠實範圍：僅實作有 reader 的 scan_whitelist（出站白名單），不放無作用假設定（穩定優先）。**M5 本地 Web Portal 完成（T501–T507）**。
- **a11y 實證（M5 累計）**：Playwright + axe-core 掃 production build，WCAG 2.1 AA tags 0 violations — Login/Dashboard/CreateScan/ScanResult + Settings/Status，zh-TW/en-US × light/dark 共 9 變體。
- **對抗式 review 後強化（T505/T507）**：多代理人審查確認 23 項 finding，已修全部 HIGH/MEDIUM 與划算 LOW —
  ① 換頁將焦點移至 `<main tabIndex=-1>`（WCAG 2.4.3，axe 無法偵測之 SPA 焦點孤立）；
  ② Settings/Status 之 `role=alert`/`role=status` live region 改為**常駐 DOM 僅切換文字**（WCAG 4.1.3，避免條件掛載漏播）；
  ③ Status uptime 文字補 `dark:` 對比（修深色 4.16:1 不達標）；④ Settings 初次載入失敗不渲染空表單、清空白名單需二次確認（防誤覆蓋 SSRF 白名單）；
  ⑤ forbidden/error/loading 分支補 `<h1>`；⑥ overall 改 `dl`、PrimaryNav `aria-current`、textarea `aria-invalid`、`requireRole` 403 補 `return`、`collectStatus` 統一注入時鐘。
- **M5/T504**：掃描 UI 主流程（ADR-005 / FR-404）`@accessify/web`：極簡 hash router（無外部相依，離線/穩定優先）+ 認證守衛 + 四頁面 — Login（含 mustChange 提醒橫幅）、Dashboard（掃描清單表格 + 狀態徽章）、CreateScan（admin、URL/sitemap、白名單錯誤回饋）、ScanResult（問題摘要 + 問題表 + 報表下載 + refresh）。新增 API `GET /api/reports/:id/download`（同源 httpOnly session cookie 授權、content-type/disposition、稽核）；前端以 `<a download>` 命中。i18n 雙語擴充 nav/login/scan/error 四區（key-diff 對齊）。**a11y 實證**：Playwright + axe-core 掃 production build，Login（zh-TW/en-US × light/dark）+ Dashboard/CreateScan/ScanResult（stub API、真實資料）共 6 變體 **0 WCAG 2.1 AA 違規**。`tsc -b`/`vite build`/lint 綠、87 unit tests green（+下載端點 200/404/401）。
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

### Fixed
- **掃描器於嚴格 CSP 站台整個失敗（release 驗證發現）**：被掃頁面的 `Content-Security-Policy: script-src` 會阻擋
  axe/HTMLCS 的 `page.addScriptTag` 注入，導致掃描拋錯中止。修復：建立 Playwright context 時加 `bypassCSP: true`
  （`scanner/scan.ts`、`render.ts`）。**出站白名單仍由 `context.route` 每請求強制，與 CSP 無關 → SSRF 邊界不受影響（ADR-009）**。
  以真實掃描 https://github.com/ 驗證：修復後 10 findings（htmlcs）+ 6 雙語報表含中文 PDF（修復前 0、直接失敗）。
- 新增 `scripts/scan-url.mjs`（開發/release 驗證用 CLI：對單一白名單 URL 跑完整管線；亦為 CSP 回歸驗證工具）。
- **報表「說明」欄在 zh-TW 仍為英文（release 驗證發現）**：axe/HTMLCS 引擎訊息原樣英文，報表只在地化標籤未譯訊息。
  新增 `mapping/messages.ts` `localizeFindingMessage`：常見規則（依 axe id / HTMLCS 技術碼比對）→ 精準 zh-TW；
  未涵蓋者以對應 WCAG 準則中文名兜底（zh-TW 報表永遠中文、不留英文）；en-US 維持引擎原文。
  以 github.com 驗證：zh-TW 報表說明 0 句殘留英文，en-US 不變。

### Changed（對抗式審查後強化）
- 經多代理人審查（60 條確認 finding）後強化：新增 ADR-008（內網 TLS/secrets）、ADR-009（Chromium sandbox + 掃描器出站安全）、ADR-010（離線時間/排程）、ADR-011（資料保留/磁碟/可觀測）。
- 更正第三方引擎授權標示：axe-core MPL-2.0、pa11y LGPL-3.0-only、HTML_CodeSniffer **BSD-3-Clause**（先前誤標 LGPL）；查證紀錄於 `.asp-fact-check.md`。
- 修正 ROADMAP DAG（T403 milestone 倒置）並補缺漏任務：i18n CI 閘、a11y/e2e harness、admin bootstrap、資料保留、TLS 佈建、狀態頁。
- 修正 SQLite 雙寫程序並發策略（busy_timeout）、WAL 一致性備份、離線原生模組建置等多項穩定性與安全缺口。

## [0.1.0] - 2026-06-24
- 專案初始化。
