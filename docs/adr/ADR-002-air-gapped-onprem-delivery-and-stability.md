# [ADR-002]: 地端離線（軍網）部署與穩定性架構

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

> **狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

Accessify 部署於**完全無網際網路的軍用網路**，且**進場修復/更新的申請流程冗長**——一旦部署，現場介入成本極高。因此架構的第一優先是**穩定**與**離線自足**：不能在執行或部署時依賴任何外部網路資源，升級必須可離線、可回滾。

---

## 評估選項（Options Considered）

### 選項 A：Docker 映像離線交付（`docker save/load`）+ 內建所有資產

- **優點**：runtime、Chromium、字型、依賴全部封裝於映像；現場 `docker load` 即可；版本固定、可重現；回滾＝切回舊映像 tag。
- **缺點**：映像體積較大（含 Chromium）。
- **風險**：需確保建置階段已抓齊離線資產（建置在有網環境完成）。

### 選項 B：現場 `npm install` / 下載 Chromium

- **優點**：映像小。
- **缺點**：**軍網無法執行**——npm registry、Chromium CDN 皆不可達。直接出局。

### 選項 C：原生安裝（非容器）+ 手動佈署相依

- **優點**：無 Docker 依賴。
- **缺點**：相依管理脆弱、難重現、難回滾，違反穩定優先。

---

## 決策（Decision）

採 **選項 A：Docker 映像離線交付**，並訂定以下穩定性規範：

1. **零對外請求**：執行期禁 CDN、外部字型、telemetry、分析、雲端 SDK。建置期完成所有抓取。
2. **資產內建**：Playwright Chromium 二進位、CJK 字型（Noto Sans TC）+ 拉丁字型（Inter）以**本地子集化 woff2** 內建於映像。
3. **離線依賴 vendoring（供應鏈）**：拍板採**完整 vendored tarball 入庫**（將相依 tarball 連同 `package-lock.json` 一併納入版本控制），以 `npm ci --offline` 從庫內建置，符合軍網稽核可審計、可離線重建之要求。Chromium 二進位與字型檔（Noto Sans TC / Inter）須記錄 **SHA256 checksum + 來源（上游 URL／release）**，並文件化**上游更新流程**：有網環境重抓 → 驗 checksum → 重 pin（鎖定 Chromium revision / 套件版本）→ 重建映像 → 對回歸基準站台跑回歸 → 通過後打新 tag。
4. **可重現建置**：固定 base image digest、Node 版本、相依版本；建置腳本冪等。
5. **交付物**：`docker save` 產出 tar + 安裝/驗證腳本 + compose 檔；現場 `docker load` → `docker compose up`。
6. **報表儲存**：本地檔案系統 volume（非物件儲存），單機自足。
7. **升級 + 回滾**：新版以新映像 tag 載入，compose 切換；**保留前一版映像可一鍵回滾**。DB migration 採 **expand-contract（向後相容）**——先擴充（新增欄位/表，新舊映像皆可運作）再收斂（移除舊結構），取代原「前向相容（forward-only）」。回滾語意明確區分兩類：
   - **相容 migration**：直接切回前一版映像即可，資料保留。
   - **不相容 migration**：須**還原升級前備份**，並明確接受**「升級後新增之資料遺失」**為預期語意。
   RUNBOOK 須**逐版標註每次 migration 屬相容或不相容類別**（見 DEPLOY_SPEC）。
8. **健康檢查 + 冒煙測試**：容器 healthcheck + 部署後 smoke test 腳本。

---

## 後果（Consequences）

**正面影響：**
- 現場零網路依賴；升級/回滾流程明確，降低冗長進場風險。
- 版本與資產固定 → 高度可重現、穩定。

**負面影響 / 技術債：**
- 映像體積大、建置需在有網環境預備離線資產。
- 字型/瀏覽器更新需重新建置映像（可接受，符合穩定優先）。

**後續追蹤：**
- [ ] M0：base 映像（Node + Chromium + 字型）與離線建置腳本。
- [ ] M7：離線安裝包、備份/還原、升級+回滾 runbook、smoke test。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 執行期對外請求 | 0 | 斷網執行 + 網路監看 | M1 / M7 |
| 離線部署 | `docker load`+`up` 即可運行 | 斷網部署演練 | M7 |
| 可重現建置（可驗證代理） | lockfile + pinned base image digest + pinned Chromium revision；相同 lockfile → 相同 `npm ls` 套件樹 | 連續兩次建置比對套件樹 | M0 |
| 回滾 | 可回滾至備份點且**無資料損毀**（非無資料遺失）；相容 migration 切回前版保資料，不相容則還原備份 | 升級/回滾演練 | M7 |

> **註：** 不追求逐位元相同的映像 digest（在含 Chromium／字型之大型映像下實務上不可達）。若日後真要達成 digest reproducibility，須額外導入 `SOURCE_DATE_EPOCH`、固定檔案 mtime、與 BuildKit 可重現建置設定。

---

## 關聯（Relations）

- 參考：ADR-001（技術棧）、ADR-003（SQLite 單檔備份）、DEPLOY_SPEC.md
- Chromium sandbox／容器安全：移至 **ADR-009**（容器內 Chromium sandbox 與掃描器出站安全）
- 資料保留與磁碟治理：移至 **ADR-011**（資料保留、磁碟治理與本地可觀測）
- TLS 憑證與 secrets 管理：見 **ADR-008**（內網 HTTPS/TLS 憑證與機敏資料管理）
- 離線時間來源與排程：見 **ADR-010**（離線時間來源與排程策略）

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
