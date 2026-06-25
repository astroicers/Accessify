# Accessify 維運手冊（RUNBOOK）

> 地端、無網際網路（軍網）單機部署。所有指令在部署主機的專案目錄執行。
> 對應：ADR-002（離線交付/升級/回滾）、ADR-003（SQLite/備份）、ADR-008（機密）、ADR-009（容器安全）、ADR-011（保留/磁碟）。

## 1. 元件

- `api`：REST API + 同容器靜態服務 web Portal（SPA）+ TLS 終結。對外 `APP_PORT`（預設 8443）。
- `worker`：背景掃描 + 排程 + 報表產生（內建 Chromium）。無對外埠。
- 共用 volume：`data`（SQLite WAL）、`reports`（報表檔）。機密：`./secrets/`（0600，bind mount）。

## 2. 首次安裝（離線）

於有網建置環境：
```bash
scripts/package-offline.sh 0.1.0          # 產出 dist/accessify-image-0.1.0.tar.gz 與 deploy tar
```
搬運至現場主機後：
```bash
ACCESSIFY_TAG=0.1.0 scripts/install.sh accessify-image-0.1.0.tar.gz
scripts/verify.sh                          # 冒煙：healthz / OpenAPI / SPA
docker compose logs api | grep 'initial admin password'   # 取一次性 admin 密碼，登入後立即改密
```
登入後於「設定」頁設定**掃描白名單**（空白名單 = 拒絕所有掃描，屬安全預設）。

## 3. 備份（一致性快照；切勿 cp 使用中 .db）

```bash
scripts/backup.sh                          # → ./backups/accessify-backup-<ts>.tar.gz
```
- SQLite 以 **Online Backup API** 取一致快照（含未 checkpoint 的 WAL）。
- 內含 `accessify.db`、`reports/`、`secrets/`、`MANIFEST.txt`（schema_version + 時間）。
- 備份含機密 → 比照機密等級保管。建議排程定期執行並異地保存。

## 4. 還原

```bash
scripts/restore.sh ./backups/accessify-backup-<ts>.tar.gz
```
- 還原前自動 `quick_check` 驗證；停 stack → 寫回 data/reports（+secrets）→ 重啟。

## 5. 升級（離線）+ 回滾

遷移採 **expand-contract**（向後相容），由 entrypoint 啟動時自動套用。**每個遷移**須於本表標記相容性：

| 遷移版本 | 名稱 | 相容性 | 回滾方式 |
|---------|------|--------|---------|
| v1 init / v2 auth / v3 schedules / v4 notifications | 皆為新增（additive） | **相容** | 切回前一版映像 tag |

升級：
```bash
scripts/upgrade.sh accessify-image-<new>.tar.gz <new-tag>
# 步驟：強制備份（失敗即中止）→ 載入映像 → 記錄前一版 tag → 切換 → 等健康
```

回滾（**一鍵**，因進場困難）：
```bash
scripts/rollback.sh                        # 相容遷移：切回前一版映像 tag，資料保留
scripts/rollback.sh ./backups/<升級前備份>  # 不相容遷移：還原備份 + 切回前一版（接受升級後新資料遺失）
```

## 6. 例行維運

- 健康：`docker compose ps`（api/worker 應為 healthy）；或 `/api/status`（佇列/磁碟/DB/憑證）。
- 日誌：`docker compose logs -f api|worker`。
- 重啟存活：`docker compose restart` 後資料/任務由 SQLite 持久化；孤兒 job 由 worker `reclaimExpired` 回收。
- 磁碟：`/api/status` 達 `diskUsedPct`(90%) 閾值轉 degraded。**資料保留**由 worker 依 `RETENTION_DAYS` 每日自動清理
  逾期且已結束（completed/failed）的掃描（連同 pages/issues/reports/notifications 與報表檔），並週期 WAL checkpoint
  收斂 `-wal`（`RETENTION_TICK_MS`，預設每日）。**預設 `RETENTION_DAYS=0`＝停用刪除（僅 checkpoint）**；於 `.env`
  設 `RETENTION_DAYS=30`（範例）並重啟 worker 即啟用。⚠ 刪除**不可逆**，請依 ADR-011 審慎設定保留期，避免誤刪需留存的稽核資料。
- 機密輪替：替換 `./secrets/*` 後 `docker compose up -d`；cookie 金鑰輪替會使既有 session 失效。

## 7. 內網 TLS 憑證（佈建與輪替；T706 / ADR-008）

- **佈建**：`install.sh` 首次安裝時，若 `./secrets/tls_cert.pem` / `tls_key.pem` 不存在會產生**自簽**憑證（過渡用）。
  正式場域建議改用**內部 CA 簽發**的憑證（瀏覽器/用戶端預先信任該 CA）。
- **輪替**：
  ```bash
  scripts/rotate-tls.sh /path/to/new-cert.pem /path/to/new-key.pem   # 內部 CA 憑證（會驗證 cert/key 相符）
  scripts/rotate-tls.sh --self-signed                                # 重新自簽（過渡）
  ```
  輪替會替換 `./secrets/tls_*`（key 600 / cert 644）並**強制重建 api 容器**重讀憑證（worker 不受影響）。
- **到期監控**：`/api/status` 的 `tls.daysRemaining` 回報剩餘天數；低於門檻（預設 14 天）整體狀態轉 degraded。
  狀態頁「TLS 憑證」區可見。請於到期前以上述指令輪替。
- 憑證/私鑰屬機密（`./secrets/`，已納入備份範圍與 `.gitignore`）；私鑰外洩須立即輪替。

## 8. 疑難排解

| 症狀 | 處置 |
|------|------|
| api 不健康 | `docker compose logs api`；確認 TLS/secrets 檔存在（缺檔會降級 HTTP 並警告）。 |
| 掃描全部 400 not_whitelisted | 於設定頁新增白名單主機；loopback 永遠被 egress 封鎖（設計）。 |
| worker 不健康 | 檢查 `/data/worker.heartbeat` 是否更新；查 worker 日誌（Chromium/掃描錯誤單頁隔離）。 |
| 升級後異常 | `scripts/rollback.sh`（相容）或帶升級前備份（不相容）。 |
