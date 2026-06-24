# [ADR-011]: 資料保留、磁碟治理與本地可觀測

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

**狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

Accessify 部署於 air-gapped 軍用內網、無對外網路、現場服務緩慢，定位為 stability-first 的長跑服務。長時間運行下，日誌、報表（reports）、歷史 scan/issue 與 SQLite 的 `-wal` 檔會持續累積，若無治理機制，磁碟將無界成長（unbounded growth），最終拖垮整個服務的穩定性。

同時，內網環境無外部 APM/監控（無外網），維運者無法依賴雲端可觀測平台，因此必須提供**站內（in-app）**的本地健康/狀態頁與閾值告警，使現場人員能在無外網條件下掌握 worker 心跳、佇列積壓、磁碟用量、DB 完整性、排程狀態與憑證到期等關鍵指標。

本 ADR 對應 SRS FR-602（本地健康/狀態頁，對應 ROADMAP T507）與 FR-603（資料保留與磁碟治理，對應 ROADMAP T705）。

---

## 評估選項（Options Considered）

### 選項 A：應用內建保留治理 + 站內健康/狀態頁（採用）

於應用層自行實作日誌輪替、報表/歷史資料保留清理、SQLite WAL checkpoint，並提供無外網的本地健康/狀態頁與站內閾值告警。

**優點**：完全 self-contained，符合零對外與 air-gapped 約束；參數可設定，貼合現場資源；與既有 Node.js+TS monorepo、SQLite(WAL)、in-DB job queue 一致，不引入額外依賴；維運者單一介面即可掌握全貌。

**缺點**：需自行實作與測試輪替/清理/checkpoint 邏輯與狀態頁，增加初期開發量。

### 選項 B：依賴外部工具鏈（logrotate / cron / 外部監控 agent）

以宿主機 OS 層 logrotate、cron 清理腳本，並接外部監控（如 Prometheus + node_exporter + 外部告警）處理保留與可觀測。

**優點**：成熟工具、實作量低；輪替/排程為業界標準。

**缺點**：與 air-gapped、單一容器化交付與「零對外」定位衝突（外部監控通常預期對外或額外基礎設施）；治理邏輯分散於 OS 與應用之間，狀態頁難整合 DB 完整性/佇列積壓/憑證到期等應用內語意；現場服務緩慢下，跨多工具的運維負擔高、不利穩定。

**結論**：air-gapped + stability-first + 單一交付 + 零對外的約束下，選項 A 將治理與可觀測收斂於應用內，最符合產品定位；選項 B 的外部依賴與應用內語意整合不足為主要否決理由。

---

## 決策（Decision）

採用**選項 A：應用內建保留治理 + 站內健康/狀態頁**，具體如下：

1. **日誌輪替與保留**：日誌採 size/time 輪替 + 保留份數（rotate 份數），所有參數明確且可設定（configurable）。

2. **報表與歷史資料保留清理**：reports 與舊 scan/issue 的保留期自動清理，可設定，預設例如保留 N 次或 X 天。

3. **SQLite WAL 治理**：啟用 WAL `wal_autocheckpoint`，並定期執行 `PRAGMA wal_checkpoint(TRUNCATE)`，防止 `-wal` 檔膨脹。

4. **本地健康/狀態頁（無外網）**：站內 `/status` 頁涵蓋——worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期天數；對磁碟用量與憑證到期觸發**站內**閾值告警（in-app alerts，不對外發送）。

---

## 後果（Consequences）

**正面：**
- 長跑下磁碟用量受控、不無界成長，提升 stability-first 服務的長期穩定。
- 維運者在無外網下，透過單一站內頁面即可掌握 worker/佇列/磁碟/DB/排程/憑證等關鍵狀態並接收閾值告警。
- 治理參數可設定，貼合現場資源限制；WAL checkpoint 防止 SQLite 檔案膨脹。

**負面 / 取捨：**
- 需自行實作並測試輪替、清理、checkpoint 與狀態頁，初期開發與測試成本較高。
- 自動清理涉及刪除歷史資料，需審慎設定保留期並於 runbook 標註，避免誤刪需保留之稽核資料。
- 狀態頁屬 Authenticated 頁面，須一併滿足產品自身 WCAG 2.1 AA 要求。

---

## 成功指標（Success Metrics）

- **磁碟有界**：在連續長跑（含多輪 scan/報表產生）情境下，磁碟用量於設定保留參數內維持有界，不持續無界成長。
- **狀態頁涵蓋度**：`/status` 頁 100% 涵蓋本 ADR 列出之指標項（worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期天數）。
- **閾值告警**：磁碟用量與憑證到期超過設定閾值時，站內告警於狀態頁觸發；零對外發送。
- **WAL 不膨脹**：定期 `wal_checkpoint(TRUNCATE)` 後 `-wal` 檔大小回落，長跑下不持續膨脹。

---

## 關聯（Related）

- ADR-002（air-gapped 地端交付與穩定性）
- ADR-003（SQLite 與內嵌佇列）
- ADR-008（內網 HTTPS/TLS 憑證與機敏資料管理）— 憑證到期天數與站內告警
- ROADMAP T507（本地健康/狀態頁 + 站內閾值告警）、T705（資料保留與磁碟治理）
- SRS FR-602、FR-603

---

## Verification Evidence

（待填）
