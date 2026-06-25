# Accessify 部署驗收清單（T704）

> 地端離線單機交付的驗收項目。狀態欄：
> ✅ 本環境已實證 — **單元測試**（`make test`）或可重現的開發機 **in-proc smoke**（`node scripts/smoke-inproc.mjs`，需先 `npm run build`）。
> 🟡 需現場 docker 環境執行（已提供可執行腳本/步驟）。
> 對應 ADR-002/003/009/011 與 DEPLOY_SPEC §5。

## A. 端到端管線（核心價值）

可重現指令：`npm run build && node scripts/smoke-inproc.mjs`（真實 Chromium，離線）。

| # | 項目 | 驗證方式 | 狀態 |
|---|------|---------|------|
| A1 | 掃描→對應→入庫→雙語六報表 | 單元測試 `buildReports`（pages/issues/6 報表）；+ in-proc smoke：真實 Chromium 掃 `test/fixtures/with-violations.html` → 8 issues → 6 報表 | ✅ |
| A2 | **中文 PDF**（CJK 字型內建、離線） | in-proc smoke 的 zh-TW PDF：`%PDF` magic + ~181KB + 內含中文（`scripts/smoke-inproc.mjs`） | ✅ smoke |
| A3 | runJob 冪等（retry 不重複入庫） | in-proc smoke 同 scan_task 連跑兩次 → DB 仍 1 page / 8 issues / 6 reports | ✅ smoke |
| A4 | 誠實涵蓋率（非 100%） | 報表含 `coverageNote`（自動 ~27%）；`coverageSummary()` 單元測試 | ✅ |

## B. 單機部署與服務

| # | 項目 | 驗證方式 | 狀態 |
|---|------|---------|------|
| B1 | `docker compose up` 單機起 api+worker | `scripts/install.sh` → `docker compose ps` 皆 healthy | 🟡 現場 |
| B2 | Portal 可達（SPA 同容器服務） | `scripts/verify.sh`：`GET /` 回 SPA、`/api/openapi.json` 契約、`/healthz` | 🟡 現場 |
| B3 | 非 root 可寫 data/reports（首啟不 EACCES） | Dockerfile `mkdir+chown` 掛載點；首啟產生 `accessify.db` | 🟡 現場 |
| B4 | TLS 終結（內網自簽/CA） | `install.sh` 產自簽；`verify.sh` 以 `-k` 連 https | 🟡 現場 |

## C. 穩定性（進場困難 → 必過）

| # | 項目 | 驗證方式 | 狀態 |
|---|------|---------|------|
| C1 | 容器重啟後資料/任務存活 | `docker compose restart` → scans/issues/排程仍在（SQLite 持久化）；孤兒 job `reclaimExpired` 回收 | 🟡 現場 |
| C2 | worker 崩潰恢復（RTO） | `docker kill worker` → `restart: unless-stopped` 自動拉起；心跳檔恢復更新 | 🟡 現場 |
| C3 | 單頁逾時不拖垮佇列 | `scanSite` 單頁失敗隔離（`PageScanResult.ok=false`）；單元測試覆蓋 | ✅ |
| C4 | 磁碟閾值行為 | `/api/status` 達 `diskUsedPct`(90%) 轉 degraded；`collectStatus` 單元測試 | ✅ |
| C5 | **備份→還原→回滾 端到端** | `db.backup()` 一致快照 round-trip（integrity ok + 資料完整）單元測試；現場 `backup.sh`/`restore.sh`/`rollback.sh` | ✅ 機制 / 🟡 全流程現場 |

## D. 離線/安全（軍網鐵則）

| # | 項目 | 驗證方式 | 狀態 |
|---|------|---------|------|
| D1 | 執行期 0 對外連線 | 程式碼層：掃描受 egress 白名單把關（loopback/link-local 永久封鎖，單元測試）；無 telemetry/CDN/外部字型；建置期才抓 Chromium | ✅ 程式碼 / 🟡 現場斷網演練 |
| D2 | SSRF 邊界 | egress 每請求 + redirect 後校驗；白名單建立時格式驗證；單元測試 | ✅ |
| D3 | 機密不入映像/版控 | `.gitignore` 排除 `/secrets/`；`install.sh` 現場產生 0600；`.env.example` 無明文 | ✅ |
| D4 | 自身 WCAG 2.1 AA | Playwright + axe-core 掃 production build，全頁面 zh-TW/en-US × light/dark 0 violations | ✅ |

## E. 現場斷網演練腳本（B/C 類 🟡 項目）

```bash
# 0 外連演練：切斷主機對外網路後
scripts/install.sh accessify-image-<tag>.tar.gz   # 仍應成功（映像/相依/字型/Chromium 皆內建）
scripts/verify.sh                                  # healthz/openapi/spa 綠
# 端到端掃描（需白名單 fixture，loopback 受 egress 封鎖）：
#   啟用 docker-compose.yml 內 fixtures sidecar（主機名 'fixtures'，跑 scripts/serve-fixtures.mjs）；
#   登入 Portal → 於「設定」頁將 fixtures 加入掃描白名單（白名單存於 DB，非環境變數）→
#   建立掃描 http://fixtures:8080/ → 結果頁出現問題 → 下載 zh-TW PDF（中文）。
# 重啟存活：docker compose restart && scripts/verify.sh
# worker 崩潰：docker kill <worker> ；觀察自動重啟與 /api/status 心跳恢復。
# 備份/還原/回滾：scripts/backup.sh → scripts/restore.sh <tar> → scripts/upgrade.sh → scripts/rollback.sh
```

> 註：本環境無 docker daemon，B/C/D 之 🟡 項目以「已提供可執行腳本 + 步驟」交付，現場依上表逐項勾稽。
> ✅ 項目來源：D4（自身 WCAG-AA）由 `make e2e`（Playwright + axe）實證；其餘 ✅ 由 `make test`（vitest 單元測試）
> 或 `node scripts/smoke-inproc.mjs`（in-proc 真實 Chromium e2e）可重現（見各列「驗證方式」與 CHANGELOG）。
