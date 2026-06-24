# Changelog

本檔遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本採 [語意化版本](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added
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
