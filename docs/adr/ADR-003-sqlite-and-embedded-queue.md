# [ADR-003]: 資料庫與佇列 — SQLite + 內嵌佇列

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

地端單機、內網低流量、穩定優先、進場維護困難。需要：(1) 持久化掃描任務/結果/報表/稽核；(2) 背景長任務佇列（掃描耗時，不可阻塞 API）。每多一個服務（DB server、Redis）就多一份維運與故障面，與穩定優先相悖。

---

## 評估選項（Options Considered）

### 選項 A：SQLite + 內嵌佇列（in-DB job table + 單一 worker）

- **優點**：**零獨立服務**；單一檔案備份/還原；WAL 模式對單機低並發足夠；佇列即一張 job 表 + worker 輪詢，無 Redis。最少元件。
- **缺點**：高並發寫入有限；非分散式。
- **風險**：跨程序寫入鎖（api 與 worker 為兩個寫入程序）→ 以 WAL + 短寫交易 + `busy_timeout` + 寫入序列化界線緩解（見「決策」跨程序並發策略）。

### 選項 B：PostgreSQL + pg-boss

- **優點**：佇列在 DB 內、無 Redis；並發較強、較標準。
- **缺點**：多一個 DB 服務要維運、備份、離線升級。

### 選項 C：PostgreSQL + Redis + BullMQ（原文件設計）

- **優點**：佇列功能完整、並發強。
- **缺點**：**元件最多**（DB + Redis + app + worker），離線維運面最大，最不符穩定優先。

---

## 決策（Decision）

採 **選項 A：SQLite + 內嵌佇列**（依使用者確認）。

- SQLite 開 **WAL** 模式；連線層用成熟驅動（如 `better-sqlite3`，同步、穩定、無原生網路）。
- Schema 以遷移檔管理（**expand-contract／向後相容** migration，配合 ADR-002 回滾策略）。
- **內嵌佇列**：`jobs` 表（狀態：pending/running/done/failed/retry）+ **單一 worker** 程序輪詢領取、可重試、可續接（resumable）。
- 任務狀態機 + 稽核日誌寫入同一 DB。
- 備份＝**一致性快照**（SQLite Online Backup API `db.backup()` 或 `VACUUM INTO`，含未 checkpoint 的 WAL；**禁止 raw `cp` 主檔**）+ reports volume；還原前 `PRAGMA integrity_check`（見 DEPLOY_SPEC §6、ADR-011）。

### 跨程序並發策略（WAL 多讀單寫前提下的兩個寫入程序）

WAL 允許「多讀單寫」，但本系統有 **兩個寫入程序**：api 寫 `users`/`audit`/`scan_tasks`／enqueue `jobs`，worker 寫 `issues`（與任務狀態更新）。因此須明訂跨程序並發界線：

- **每連線** 設定 `PRAGMA busy_timeout`（例 5000ms），讓瞬間寫入鎖以重試等待化解，避免直接 `SQLITE_BUSY` 失敗。
- 一律使用**短寫交易**：交易內只做必要寫入即提交，縮短持鎖時間。
- 明訂**寫入序列化界線**：同一時刻僅單一寫者持有 write lock；`better-sqlite3` 為同步阻塞驅動，**api 端必須避免長交易**（長交易僅允許於 worker，且 worker 亦以分段短寫降低互斥窗口）。
- **checkpoint 歸屬**：WAL checkpoint 由單一程序（worker）負責執行，避免兩程序同時 checkpoint（WAL 大小治理 / `wal_autocheckpoint` 與定期 `wal_checkpoint(TRUNCATE)` 詳見 ADR-011）。
- **孤兒 running job 續接**：改用明確 **lease/heartbeat** 機制——worker 領取 job 時寫入 lease 擁有者 + 到期時間，運行中定期更新 heartbeat；**逾時未更新即由回收程序回收**（重置回 pending 或標記 retry），取代以往「啟動時無條件續接所有 running」的不精確做法。

### 原生模組離線建置（better-sqlite3）

- `better-sqlite3` 為**原生模組（native addon）**，離線環境無法於部署時編譯。須採 **vendored prebuilt**（鎖定 Node ABI / glibc / 平台三元組）或於映像內**內建 build toolchain**。
- 此約束須於 **M0 斷網建置測試**涵蓋（離線情境下安裝/建置可成功，且 ABI 與目標執行環境一致）。

---

## 後果（Consequences）

**正面影響：**
- 最少服務數，最簡備份/還原；最契合「穩定 + 簡化 + 難維護」。

**負面影響 / 技術債：**
- 單一 worker → 掃描為序列/有限並行（內網低流量可接受）。
- 若未來流量大增需重新評估（觸發條件見下）。

**後續追蹤：**
- [ ] M0：SQLite schema baseline + migration 工具 + jobs 表。
- [ ] M0：斷網建置測試涵蓋 `better-sqlite3` prebuilt / toolchain（鎖 Node ABI/glibc/平台）。
- [ ] M4：單一 worker、狀態機、重試、lease/heartbeat 續接、稽核。

**重新評估條件（可量測門檻）：**
- [ ] `jobs` pending 佇列長度持續 **> N**（例 N=50，超過 X 分鐘）→ 重新評估 worker 並行度 / 架構。
- [ ] `SQLITE_BUSY` 錯誤率 **> X%**（例 X=1%，於滾動時間窗）→ 重新評估寫入序列化界線 / 交易粒度。
- 門檻 N、X 之觀測由本地狀態頁與健康指標承載（佇列積壓、錯誤統計，見 ADR-011）。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 服務數量 | app + worker，**無獨立 DB/Redis** | compose 檢視 | M4 |
| 佇列可靠 | worker 重啟後未完成任務可續接 | 重啟中斷測試 | M4 |
| 備份/還原 | 以 Online Backup API／`VACUUM INTO` 產生一致快照後可完整還原（還原前 `integrity_check`；禁 raw cp） | 還原演練 | M7 |
| 離線建置 | `better-sqlite3` 於斷網環境安裝/建置成功且 ABI 相容 | 斷網建置測試 | M0 |

---

## 關聯（Relations）

- 參考：ADR-001、ADR-002（單檔備份）、ADR-011（資料保留、WAL checkpoint 與磁碟治理策略）、SDS.md（schema / 佇列設計）

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
