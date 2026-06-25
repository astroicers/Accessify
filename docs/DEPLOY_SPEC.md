# 部署規格書 (Deployment Specification)

| 欄位 | 內容 |
|------|------|
| **專案名稱** | Accessify |
| **版本** | v0.1.0 |
| **最後更新** | 2026-06-24 |
| **狀態** | Draft |
| **關聯** | ADR-002、ADR-003、ADR-006、ADR-008、ADR-009、ADR-010、ADR-011、SDS.md |

> **場域：地端、無網際網路（軍網）；進場維護困難 → 穩定優先、離線自足、可回滾。**

---

## 1. 部署架構

- **Docker Compose 單機**，服務：
  - `api`：REST + 靜態服務 React SPA（或 `web` 同容器）；TLS 終結於此（見 §9）。
  - `worker`：背景掃描（內含 Playwright Chromium）。Chromium 容器設定（ADR-009）：
    - `init: true`（tini）作 PID1，回收殭屍程序（zombie reaping）。
    - `--disable-dev-shm-usage` 或 `shm_size: '1gb'`，避免 /dev/shm 過小導致 Chromium 崩潰。
    - 以**非 root** user 執行。
    - sandbox 策略：優先保留 user-namespace + seccomp；若現場限制需 `--no-sandbox`，須於 RUNBOOK 記錄補償措施（網路 egress 封鎖、資源上限、容器隔離）。
  - （**無**獨立 DB / Redis；SQLite 為檔案、佇列內嵌）
- **Volumes**：
  - `data/`：SQLite 檔（WAL）
  - `reports/`：產出報表（HTML/PDF/Excel）
- 內部網路：容器間私有網路；對使用者僅暴露 api（內網 HTTPS）。
- 時區：所有容器 `TZ=Asia/Taipei`（ADR-010）。

---

## 2. 映像與離線資產（ADR-002）

- Base 映像 digest 固定、Node 版本固定。
- **內建**：Playwright Chromium 二進位、`better-sqlite3` 等原生模組之離線 prebuilt（鎖定 Node ABI；或於映像內建 build toolchain）、Noto Sans TC + Inter 子集化 woff2、所有 npm 相依（`npm ci --offline` / vendored）。
- 建置於**有網環境**完成資產抓取；產出**可重現**（相同輸入→相同 digest）。
- `better-sqlite3` prebuilt 與 Chromium 二進位**並列為離線資產**，缺一不可於斷網環境啟動。

---

## 3. 交付物（離線安裝包）

```
accessify-<version>/
├── images/                # docker save 產出的 tar（api、worker）
├── docker-compose.yml
├── .env.example           # 連接埠、語言預設、白名單、TLS 路徑、（選用）SMTP（嚴禁固定 SESSION_SECRET 預設值）
├── install.sh             # docker load + 初始化 volume + migration + secrets 產生 + 首位 admin bootstrap
├── verify.sh              # 部署後 smoke test
├── backup.sh / restore.sh # 備份/還原（SQLite + reports + secrets）
├── upgrade.sh / rollback.sh
├── gen-cert.sh            # （選用）自簽憑證產生 + 匯入內網信任鏈指引（見 §9）
└── RUNBOOK.md             # 安裝/升級/回滾/備份/TLS 輪替/migration 類別 操作手冊
```

現場流程：`docker load < images/*.tar` → 設定 `.env` → `install.sh` → `docker compose up -d` → `verify.sh`。

`install.sh` 首次啟動須（ADR-006 / ADR-008）：
- **隨機產生** `SESSION_SECRET` 與 cookie 簽章金鑰（**嚴禁**使用 `.env.example` 固定預設值），寫入 `0600` 權限之 secrets 檔並設定 `.env` 為 `600`，secrets 納入備份範圍且 RUNBOOK 標註敏感。
- **首位 admin 離線 bootstrap**（T506）：互動式建立帳號，或產生一次性隨機密碼並於首次登入強制改密；**嚴禁固定預設密碼**；納入 `verify.sh` smoke 驗收（T702）。

---

## 4. 設定（.env）

| 變數 | 說明 | 預設 |
|------|------|------|
| `APP_PORT` | 對外（內網）埠 | 8443 |
| `DEFAULT_LANG` | zh-TW / en-US | zh-TW |
| `SCAN_WHITELIST` | 允許掃描的內網網域清單 | （必填） |
| `SCAN_RATE_LIMIT` | 每站速率上限 | 保守值 |
| `SMTP_ENABLED` | 內網 SMTP 通知（選用） | false |
| `TLS_CERT_PATH` | TLS 憑證檔路徑（PEM，見 §9） | （必填） |
| `TLS_KEY_PATH` | TLS 私鑰檔路徑（PEM，見 §9） | （必填） |
| `TZ` | 容器時區（ADR-010） | Asia/Taipei |
| `SESSION_TIMEOUT` | Session 逾時（分鐘，可覆寫） | 30 |
| `RETENTION_DAYS` | 逾期掃描+報表自動清除天數（worker；0=停用刪除，見 §8） | 例：30（預設 0） |
| `RETENTION_TICK_MS` | 資料保留清理週期（毫秒，見 §8） | 例：86400000（每日） |

機敏設定不入版控（見 .gitignore）。`SESSION_SECRET` 與 cookie 簽章金鑰由 `install.sh` **首次啟動隨機產生**（嚴禁固定預設值），存於 `0600` 權限 secrets 檔；輪替後既有 session 全部失效（見 §3、ADR-008）。

---

## 5. 健康檢查與冒煙測試

- 容器 `healthcheck`：api `/healthz`、worker 心跳。
- `verify.sh`：登入 → 建立對基準站台的掃描 → 確認報表產生（含中文 PDF）→ 通過/失敗回報。

---

## 6. 備份與還原（ADR-003）

- **備份（強制單一機制）**：以 **SQLite Online Backup API（`db.backup()`）** 或 **`VACUUM INTO`** 產生一致快照（含尚未 checkpoint 之 WAL 內容），再複製快照檔 + `reports/` + secrets。**嚴禁對使用中主檔（`data/*.db`）直接 `cp`**（會漏失 WAL 並可能得到不一致映像）。
- **WAL checkpoint 策略**：開啟 `wal_autocheckpoint`（合理頁數）並由維運程序**定期執行 `PRAGMA wal_checkpoint(TRUNCATE)`**，防止 `-wal` 無界膨脹（見 §8、ADR-011）。
- **還原**：載回對應版本映像 + 還原 volume（快照檔 + reports + secrets）；**還原前須跑 `PRAGMA integrity_check`（或 `quick_check`）** 確認快照完整，再驗證 migration 版本相符。

---

## 7. 升級與回滾（穩定優先核心）

- **升級**：`upgrade.sh` **第一步強制執行 `backup.sh`（見 §6），備份失敗即中止升級**；其後載入新映像 tag → 執行 expand-contract migration → `docker compose up -d` → `verify.sh`。
- **migration 採 expand-contract（向後相容）**：先 expand（加欄位/表，新舊映像皆可運作）→ 切映像 → 後續版本再 contract（移除舊結構），確保回滾期間舊映像仍能讀寫資料。
- **啟動校驗**：服務啟動時校驗 **schema 版本 vs 映像 tag 相容性**；不相容即拒絕啟動並提示。
- **回滾語意**：保留**前一版映像**；`rollback.sh`——
  - migration **相容**（expand 階段）：直接切回舊 tag 映像即可，資料保留。
  - migration **不相容**：以 §6 備份**還原**，並**接受升級後產生之資料遺失**。
- migration 設計須**向後相容（expand-contract）**，並於 **RUNBOOK 標註每版 migration 類別（expand / contract / 不可逆）** 與升級/回滾步驟、資料影響。
- 因進場困難：升級前必跑備份；回滾為一鍵且資料完整為驗收標準。

---

## 8. 觀測與維運（ADR-011）

- 結構化日誌寫本地檔（不外送）；無外部監控；以 healthcheck + 站內狀態頁 + 稽核日誌為主。
- **日誌輪替**：依 size/time 輪替並保留份數（參數見 §4 `LOG_RETENTION`，可設定）。
- **資料保留**：逾期掃描（含 reports 檔與 pages/issues/notifications）由 worker 依 `RETENTION_DAYS` 每日自動清理（0=停用），
  並週期 WAL checkpoint，確保長跑下磁碟成長有界（ADR-011，T705）。日誌輪替屬容器層 logging driver 設定（場域既有方案）。
- **SQLite 磁碟治理**：`wal_autocheckpoint` + 定期 `PRAGMA wal_checkpoint(TRUNCATE)`，防 `-wal` 膨脹（見 §6）。
- **本地健康/狀態頁（`/status`，無外網）** 內容：worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、**憑證到期天數**。
- **站內閾值告警**：磁碟用量與憑證到期天數達閾值時於狀態頁告警（無對外連線）。時間戳記以 `Asia/Taipei`（ADR-010）。

---

## 9. 內網 TLS 憑證（ADR-008）

- **終結點**：TLS **預設由 `api` 容器終結**（或文件化由內網反向代理終結，二擇一明確記載；本規格採 api 終結）。
- **憑證來源（二擇一）**：
  - 掛載**內部 CA 簽發**之憑證；或
  - 以 `gen-cert.sh` 產生**自簽憑證** + 依指引匯入內網信任鏈（trust store）。
- **設定**：憑證/私鑰路徑由 `.env` 之 `TLS_CERT_PATH` / `TLS_KEY_PATH` 指定（見 §4）。
- **維持零對外**：**停用線上 OCSP stapling 外拉與 CRL 線上檢查**（軍網無對外連線）。
- **到期管理**：由本地狀態頁顯示憑證剩餘天數 + 閾值告警（見 §8）。
- **輪替 runbook**：替換 `TLS_CERT_PATH` / `TLS_KEY_PATH` 指向之檔案 → 重啟 api → 以 `verify.sh` 確認 HTTPS 正常；步驟記錄於 RUNBOOK。

---

## 附錄：變更歷史
| 版本 | 日期 | 摘要 |
|------|------|------|
| v0.1.0 | 2026-06-24 | 初版建立（地端離線交付） |
| v0.1.1 | 2026-06-24 | 補強備份單一機制與 integrity_check、WAL checkpoint（ADR-003/011）；新增 §9 TLS（ADR-008）；Chromium 容器 init/shm/sandbox 與 better-sqlite3 prebuilt（ADR-009）；install.sh admin bootstrap + SESSION_SECRET 隨機產生（ADR-006）；.env 新增 TLS/TZ/逾時/保留參數；升級採 expand-contract 與 schema 校驗、回滾語意；觀測補狀態頁/閾值告警/保留（ADR-011）；TZ=Asia/Taipei（ADR-010）。 |
