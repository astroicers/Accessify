# 軟體設計規格書 (Software Design Specification)

| 欄位 | 內容 |
|------|------|
| **專案名稱** | Accessify |
| **版本** | v0.1.0 |
| **最後更新** | 2026-06-24 |
| **狀態** | Draft |
| **關聯** | SRS.md、ADR-001~011、UIUX_SPEC.md、DEPLOY_SPEC.md |

---

## 1. 架構總覽（Architecture Overview）

地端單機、無網際網路。**Node.js + TypeScript 全棧 monorepo**，兩個執行程序（API、Worker）+ SQLite 單檔，皆封裝於 Docker，Compose 編排。

```
[瀏覽器/內網使用者]
      │ HTTPS（內網）
      ▼
[web (React SPA, 由 api 靜態服務或同容器)]
      │ REST
      ▼
[api  (Node/TS)] ──寫入──> [SQLite (WAL) + jobs 表]
      │                          ▲
      │ 入列                      │ 領取/更新
      ▼                          │
[worker (Node/TS)] ── Playwright headless Chromium
      │  注入 axe-core + pa11y/HTMLCS → 整併 → WCAG 對應 → 分級
      ├─> 寫入 Issue/Page/Report 至 SQLite
      └─> 報表 HTML/PDF(Playwright print，完整非子集 CJK 字型)/Excel(ExcelJS) → 本地 volume
```

**設計原則：** 最少服務（無獨立 DB/Redis）、零對外請求、所有資產內建、可重現與可回滾。

---

## 2. Monorepo 套件（npm workspaces）

| package | 職責 | 關鍵相依 |
|---------|------|----------|
| `packages/shared` | 型別、i18n catalog（zh-TW/en-US）、共用工具 | i18next |
| `packages/core` | 領域模型、設定、SQLite 存取、migration（better-sqlite3 原生模組以離線 prebuilt binary 安裝並鎖定 Node ABI；無 prebuilt 時於映像內建 build toolchain 編譯，ref ADR-002/003） | better-sqlite3 |
| `packages/scanner` | Playwright 渲染 + axe-core/pa11y 注入 + 整併去重 | playwright, axe-core, pa11y |
| `packages/mapping` | 規則碼→WCAG 對應、嚴重度分級、站台分數、涵蓋率 | （資料驅動表） |
| `packages/report` | i18n HTML 樣板 → PDF（Playwright print）、Excel（ExcelJS） | exceljs |
| `packages/api` | REST API、認證/RBAC、稽核、入列 | （HTTP 框架，如 Fastify/Express） |
| `packages/web` | React 19 + Vite SPA（visual-web-stack 基礎層） | react, vite, tailwind, radix, zustand |

> 套件邊界對應 ROADMAP milestones，利於 autopilot 逐任務實作與測試。

---

## 3. 資料庫設計（SQLite）

- 模式：**WAL（多讀單寫）**；外鍵開啟。**api 與 worker 皆為寫入程序**（api 寫 users/scan_tasks/settings/audit_logs，worker 寫 pages/issues/reports 與 job 狀態）。
- 鎖衝突治理：`PRAGMA busy_timeout(5000ms)`；一律**短交易**；**寫入序列化**（每程序內以單一寫入序列避免並發寫；跨程序倚賴 WAL 單寫 + busy_timeout 重試）。
- better-sqlite3 為**同步** API → api 端嚴禁長交易（避免阻塞事件迴圈與其他寫入），批次寫入拆分為多筆短交易。
- **Checkpoint 歸屬**：由 worker（或專責背景工作）負責 `wal_autocheckpoint` 與定期 `PRAGMA wal_checkpoint(TRUNCATE)`，防 `-wal` 膨脹（ref ADR-011）。
- **孤兒 job**：採 lease/heartbeat 機制；worker 領取時設定 lease 到期時間並週期性更新 heartbeat，逾期未更新之 `running` job 由其他 worker/啟動程序冪等續接。
- Migration：版本化 SQL/程式遷移；**expand-contract（向後相容）**，配合映像回滾（ADR-002）。

核心資料表（對應 SRS 第 7 節實體）：`users`、`scan_tasks`、`jobs`、`pages`、`issues`、`reports`、`audit_logs`、`settings`。

關鍵索引：
| 表 | 索引 | 理由 |
|----|------|------|
| `users` | `username` UNIQUE | 登入查詢 |
| `jobs` | `state, scan_task_id` | worker 領取/續接（lease/heartbeat） |
| `issues` | `page_id`, `wcag_ref`, `severity` | 結果彙整/報表 |
| `audit_logs` | `user_id, timestamp` | 稽核查詢 |

---

## 4. 掃描流程設計

1. `api` 驗證白名單/速率設定 → 建立 `scan_task` + `job(state=pending)`。
2. `worker` 輪詢領取 `pending` job（原子更新為 `running`）。
3. URL/sitemap 探索 → 逐頁 Playwright 渲染（等待 network idle / 自訂條件）。
4. 注入 axe-core `axe.run()` + pa11y/HTMLCS → 收集 raw findings。
5. **整併去重**（依 rule+selector+訊息）→ 寫入 `issues`。
6. `mapping`：rule_code→WCAG、嚴重度、站台分數、涵蓋率標示。
7. `report`：產生 zh-TW/en-US HTML→PDF + Excel，存 volume，寫 `reports`（PDF/報表路徑使用**完整（非子集）Noto Sans TC** 字型，避免動態 CJK 內容缺字）。
8. job → `done`；站內通知；失敗→`retry`（上限）→`failed`。
9. **續接**：worker 啟動時依 lease 到期/heartbeat 失效偵測孤兒 `running` job，冪等復原為 `pending`（冪等設計）。

**掃描器資源上限（單頁失敗隔離，ref ADR-009）：**
- 每頁 navigation timeout；每任務**最大頁數**與**總時長**上限。
- 每個 browser context 設**記憶體上限**，逾時/逾量即 **kill + 重啟** context。
- **重導（redirect）次數上限**；**回應大小上限**。
- 單頁失敗（逾時/崩潰）僅隔離該頁並記註記，**不得拖垮 worker 或佇列**。

**出站/egress 安全（核心，ref ADR-009）：**
- 白名單於**每個出站請求**層強制（Playwright route 攔截），對 **redirect 後最終 URL** 與**所有 sub-resource 主機**重新校驗。
- 解析後 **IP 黑名單**：loopback、link-local（169.254.0.0/16）、容器網段、未列白名單之 RFC1918。
- **禁 `file://`**。

掃描禮儀：robots **可設定**，對自有內網資產**預設忽略**；速率限制、**僅白名單內網**（ADR-002 / ADR-009 / FR-205）。

---

## 5. API 設計（REST + OpenAPI）

> `requires.api: true` → 本節為 autopilot 前置必要。契約以 OpenAPI 描述（`packages/api`），品質門檻由 `openapi` profile 把關。所有訊息走 i18next（僅 zh-TW/en-US）。**語言解析優先序：使用者持久化偏好 > 明確 `?lang` 參數 > 預設 zh-TW**；瀏覽器 `Accept-Language` **不得凌駕**「預設 zh-TW」。

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| POST | `/api/auth/login` | Guest | 本地帳號登入 → session |
| POST | `/api/auth/logout` | Auth | 登出 |
| POST | `/api/auth/change-password` | Auth | 自助變更密碼（M8/T801：強制改密流程；政策 12–72 字元、≠帳號/現密；錯誤現密走登入鎖定計數；成功後註銷其他 session） |
| GET | `/api/scans` | Auth | 掃描任務清單 |
| POST | `/api/scans` | admin | 建立掃描任務（target, type）→ 入列 |
| GET | `/api/scans/:id` | Auth | 任務狀態與結果摘要 |
| GET | `/api/scans/:id/issues` | Auth | 問題清單（分頁/篩選） |
| GET | `/api/reports/:id` | Auth | 下載報表（lang, format） |
| GET/PUT | `/api/settings` | admin | 讀取/更新系統設定 |
| GET/POST/PUT | `/api/users` | admin | 帳號管理（M8/T802：清單絕不含 password_hash；建帳未給密碼→一次性密碼僅回傳一次；不可自我管理；停用即註銷 session） |
| POST | `/api/users/:id/reset-password` | admin | 重設密碼（一次性密碼僅回傳一次、強制下次改密、清 session、歸零鎖定計數兼作解鎖） |
| GET | `/api/status` | Auth | 本地健康/狀態（worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期天數）→ `/status` 頁 |

通用：錯誤格式 `{ code, messageKey, detail }`（messageKey 對應 i18n）；所有變更型操作寫入 `audit_logs`。

帳號管理不支援 `DELETE /api/users/:id`（刻意）：`users.id` 為 `scan_tasks.created_by` /
`schedules.created_by` / `audit_logs.user_id` 之 FK（無 `ON DELETE` 子句），且稽核完整性要求保留
帳號紀錄——以「停用」取代刪除。「至少一位 active admin」不變量由「不可自我管理」+
`requireRole(admin)` 保證（lastAdmin 409 守衛為防禦縱深）。

---

## 6. i18n 設計

- i18next，catalog 於 `packages/shared/locales/{zh-TW,en-US}.json`，前端/後端/報表共用。
- 預設 zh-TW，fallback en-US；解析優先序：持久化偏好 > `?lang` > 預設 zh-TW（`Accept-Language` 不凌駕預設）；lint 禁 hardcoded；CI 檢查雙語 key 對齊（ADR-004）。

---

## 7. 錯誤處理與可觀測性

- 錯誤處理：exception 風格（ADR/ROADMAP conventions）；API 邊界統一轉為錯誤回應 + i18n。
- 日誌：結構化（structured），本地檔案；不外送。
- 故障偵測：容器 healthcheck；worker 心跳/孤兒 job 偵測（lease/heartbeat）；掃描失敗於報表註記。
- **本地健康/狀態頁（`/status`，Authenticated，無外網）**：呈現 worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期天數；磁碟/憑證越過閾值時站內告警（ADR-011）。前端為 `packages/web` 之 `/status` 元件，資料來源 `GET /api/status`。

---

## 8. 安全設計

- 密碼 bcrypt（cost ≥ 12）；session 逾時；登入失敗鎖定（ADR-006）。
- RBAC 中介層（admin/viewer）；伺服器端授權檢查。
- 無對外請求；輸入驗證（白名單、URL 格式）。

---

## 9. 部署設計

見 `DEPLOY_SPEC.md`：Compose（api + worker）、SQLite/reports volume、離線安裝包、備份/還原、升級+回滾。

關聯 ADR：
- **ADR-008（內網 TLS/憑證與 secrets）**：TLS 由 api 容器終結（預設）；憑證路徑 `TLS_CERT_PATH`/`TLS_KEY_PATH`；首次啟動隨機產生 `SESSION_SECRET`/cookie 簽章金鑰（0600，納入備份，敏感）；零對外（停用線上 OCSP/CRL）。
- **ADR-010（離線時間來源與排程）**：容器 `TZ=Asia/Taipei`；時間來自宿主機時鐘（內網 NTP/手動校時）；排程採 DB 驅動輪詢 + 相對間隔。
- **ADR-011（資料保留、磁碟治理與本地可觀測）**：日誌輪替（size/time + 保留份數）、reports/舊 scan 清理、WAL checkpoint；本地健康/狀態頁 + 磁碟/憑證閾值站內告警。

---

## 附錄：變更歷史
| 版本 | 日期 | 摘要 |
|------|------|------|
| v0.1.0 | 2026-06-24 | 初版建立 |
