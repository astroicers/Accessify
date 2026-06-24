# Changelog

本檔遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本採 [語意化版本](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added
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
