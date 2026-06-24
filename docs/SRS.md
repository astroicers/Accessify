# 軟體需求規格書 (Software Requirements Specification)

| 欄位 | 內容 |
|------|------|
| **專案名稱** | Accessify |
| **版本** | v0.1.0 |
| **最後更新** | 2026-06-24 |
| **狀態** | Draft |
| **作者** | Accessify 維護者 |
| **審閱者** | （待指派） |

---

## 1. 目的與範圍（Purpose & Scope）

### 1.1 文件目的

本文件描述 **Accessify**（地端、無網際網路場域之無障礙網頁檢測工具）的完整軟體需求，作為開發、測試與驗收基準。所有 FR/NFR/US 均可追溯至本文件（見第 10 節）。

### 1.2 專案範圍

**範圍內（In Scope）：**

- 本地帳號認證與 RBAC（admin / viewer）+ 稽核日誌
- 對**內網站台**執行無障礙掃描（單一 URL 或 sitemap）
- 規則結果對應 WCAG 2.0/2.1（A・AA）+ 嚴重度分級 + 站台分數
- 雙語報表（zh-TW / en-US）：HTML / PDF / Excel
- 本地 Web Portal：建立任務、檢視結果、下載報表、系統設定
- 排程重掃 + 掃描差異比對（已修復/新增/未改）+ 站內通知
- Docker Compose 單機、離線部署 / 備份 / 升級回滾

**範圍外（Out of Scope）：**

- 多租戶、訂閱計費（捨棄原 SaaS 設計）
- 對外網際網路掃描、雲端 / Kubernetes 部署
- 外部 Email / OAuth / 第三方通知（無網際網路）
- LDAP / AD 整合（列為未來選項）
- 宣稱 100% WCAG 合規（本工具為人工檢測前的自動化輔助）

### 1.3 定義與縮寫

| 術語 | 定義 |
|------|------|
| WCAG | Web Content Accessibility Guidelines（2.0 / 2.1，A・AA） |
| axe-core | Deque 之無障礙檢測規則庫（MPL-2.0） |
| pa11y | 無障礙檢測引擎（LGPL-3.0-only） |
| HTML_CodeSniffer | HTMLCS（squizlabs）無障礙檢測引擎（BSD-3-Clause） |
| RBAC | Role-Based Access Control |
| FR / NFR / US | 功能 / 非功能需求、使用者故事 |
| 涵蓋率 | 可由自動化判定的 WCAG 準則比例（其餘需人工檢測） |

---

## 2. 利害關係人（Stakeholders）

| 角色 | 職責 | 參與階段 |
|------|------|----------|
| 產品負責人 | 定義需求優先級、驗收 | 全程 |
| 技術負責人 | 架構決策（ADR）、技術評審 | 設計、實作 |
| 開發（全棧 TS） | scanner/mapping/report/api/web 實作 | 實作、測試 |
| QA | 測試計畫、基準站台回歸、a11y 驗收 | 測試、上線 |
| 無障礙審查員（人工） | 自動結果之後的人工複檢 | 驗收、營運 |
| 資安 | 安全審查、離線合規 | 設計、上線前 |
| 現場維運 | 離線部署、備份、升級回滾 | 上線、維護 |

---

## 3. 功能需求（Functional Requirements）

> 命名：`FR-NNN`。100=認證 / 200=掃描 / 300=WCAG 對應 / 400=報表 / 500=排程通知 / 600=設定。

### 3.1 認證與授權（FR-100）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-101 | 本地帳號（帳號 + 密碼）登入 | Must | M5 | 正確憑證成功；錯誤回 401；bcrypt cost ≥ 12 |
| FR-102 | RBAC：admin / viewer 權限分離 | Must | M5 | viewer 存取管理功能回 403 |
| FR-103 | 登入失敗鎖定 + Session 逾時 | Must | M5 | 連續失敗達閾值鎖定；逾時需重新登入；Session 逾時預設 30 分鐘（可由 .env 覆寫） |
| FR-104 | 稽核日誌（登入、建立/刪除任務、下載報表、改設定） | Must | M5 | 關鍵操作 100% 留存 user/action/time/ip |

### 3.2 掃描（FR-200）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-201 | 以 headless Chromium 渲染內網頁面（支援 SPA/JS） | Must | M1 | 渲染完成後才掃描；動態內容可見 |
| FR-202 | axe-core 檢測並輸出原始 findings | Must | M1 | 基準站台 findings 穩定可重現 |
| FR-203 | pa11y / HTMLCS 檢測並與 axe 結果整併去重 | Must | M1 | 重複 finding 去重正確 |
| FR-204 | 由單一 URL 或 sitemap 探索並逐頁掃描 | Must | M1 | sitemap 內頁面皆被掃描 |
| FR-205 | 掃描禮儀：遵守 robots、速率限制、**僅限白名單內網站台** | Must | M1 | 非白名單目標拒絕；速率不超限 |
| FR-206 | 掃描為背景長任務（佇列），不阻塞 API | Must | M4 | 建立任務即回應；進度可查 |

### 3.3 WCAG 對應引擎（FR-300）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-301 | 規則碼 → WCAG 2.0/2.1（A・AA）對應（資料驅動） | Must | M2 | 對應表可維護；每 finding 有對應準則 |
| FR-302 | 嚴重度分級（嚴重/高/中/低/提示）+ 站台分數 | Must | M2 | 分級規則明確；分數可重現 |
| FR-303 | 涵蓋率與**誠實標示**（自動涵蓋 vs 需人工檢測） | Must | M2 | 報表標示涵蓋率；不宣稱 100% |

### 3.4 報表（FR-400）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-401 | 雙語（zh-TW/en-US）HTML 報表（樣板化） | Must | M3 | 切換語言內容完整；無 hardcoded |
| FR-402 | PDF 輸出（Playwright print + 內嵌 CJK 字型，離線） | Must | M3 | 中文不缺字；離線可產生 |
| FR-403 | Excel 修改清單（ExcelJS，可追蹤欄位） | Must | M3 | 每問題一列，含狀態/建議欄 |
| FR-404 | 報表存於本地檔案系統 volume，可下載 | Must | M4 | 產生後可在 Portal 下載 |

### 3.5 排程、差異與通知（FR-500）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-501 | 週期性排程重掃內網站台 | Should | M6 | 依設定週期觸發掃描 |
| FR-502 | 與上次掃描差異比對（已修復/新增/未改） | Should | M6 | 差異分類正確 |
| FR-503 | 站內通知（完成/差異）；內網 SMTP 為選用且預設關閉 | Should | M6 | 站內通知可見；無外網依賴 |

### 3.6 系統設定（FR-600）

| ID | 需求描述 | 優先級 | 對應 ROADMAP | 驗收標準 |
|----|----------|--------|--------------|----------|
| FR-601 | 設定白名單、速率、預設語言、排程預設、（選用）SMTP | Must | M5 | 設定即時生效；變更入稽核 |
| FR-602 | 本地健康/狀態頁（無外網）：worker 心跳、佇列積壓、最近失敗、磁碟用量、DB integrity、排程上次/下次、憑證到期天數 | Must | M5 | 狀態頁涵蓋上述指標；磁碟/憑證閾值觸發站內告警 |
| FR-603 | 資料保留與磁碟治理：日誌 size/time 輪替 + 保留份數、reports/舊 scan/issue 自動清理、WAL checkpoint | Must | M7 | 長跑下磁碟不無界成長；保留參數可設定 |

> **優先級：** Must（MVP 必須）/ Should（重要，應於初版）/ Nice（有餘力）。

---

## 4. 非功能需求（Non-Functional Requirements）

| 類別 | 需求 | 目標值 | 驗證方式 |
|------|------|--------|----------|
| **離線** | 執行期對外網際網路請求 | 0 | 斷網執行 + 網路監看 |
| **穩定** | 服務元件數（無獨立 DB/Redis） | app + worker | compose 檢視 |
| **穩定** | 可重現建置（相同輸入→相同映像） | 一致 digest | 連續建置比對 |
| **穩定** | worker 重啟後未完成任務可續接 | 100% | 中斷/重啟測試 |
| **無障礙** | 本產品 Web Portal 自身合規 | WCAG 2.1 AA | axe + 鍵盤 + screen reader |
| **i18n** | 使用者可見 hardcoded 字串 | 0 | lint |
| **i18n** | 語系數 / 雙語 key 對齊 | 2 / 100% | catalog 檢查 |
| **效能** | 單頁掃描（內網典型頁） | 合理時間（基準量測） | 基準站台量測 |
| **安全** | 密碼儲存 | bcrypt cost ≥ 12 | 程式碼審查 |
| **可維護** | 測試覆蓋率 | > 80%（核心 > 90%） | `make coverage` |
| **可維護** | 離線升級 + 回滾 | 可一鍵切換且資料完整 | 升級/回滾演練 |
| **韌性** | worker 崩潰恢復 | 於 RTO 內自動重啟並續接未完成任務 | 崩潰注入 + 恢復計時 |
| **韌性** | 磁碟閾值行為 | 達閾值觸發站內告警並執行保留清理 | 磁碟壓力測試 |
| **韌性** | 單頁逾時隔離 | 壞頁逾時即殺，不拖垮 worker，佇列續行 | 壞頁注入 |
| **韌性** | 備份→還原→回滾端到端 | 端到端必過、資料完整 | 端到端演練 |
| **離線** | 斷網 0 外連（正式 NFR） | 0 | 斷網執行 + 網路監看 |
| **韌性** | 資料成長有界 | 長跑下磁碟用量有界 | 長跑 + 磁碟量測 |

---

## 5. 使用者故事（User Stories）

**US-201：建立掃描任務**
- **As a** admin
- **I want** 輸入內網站台 URL 或 sitemap 並建立掃描任務
- **So that** 系統能背景掃描並產出報表

**Acceptance Criteria:**
- [ ] 目標須在白名單內，否則拒絕並提示
- [ ] 建立後即回應，任務進入佇列，可查進度
- [ ] 完成後可檢視結果與下載報表

**Maps to:** FR-204, FR-205, FR-206 | Task: M1/M4/M5

---

**US-202：檢視結果與下載雙語報表**
- **As a** viewer
- **I want** 檢視掃描結果並下載 zh-TW/en-US 報表（PDF/Excel）
- **So that** 我能進行人工複檢與追蹤修正

**Acceptance Criteria:**
- [ ] 結果含嚴重度、WCAG 對應、涵蓋率標示
- [ ] PDF 中文不缺字；Excel 為修改清單
- [ ] viewer 無法存取管理功能

**Maps to:** FR-301~303, FR-401~404, FR-102 | Task: M2/M3/M5

---

**US-301：管理帳號與系統設定**
- **As a** admin
- **I want** 管理帳號/角色與白名單、速率、語言、排程預設
- **So that** 維持安全與掃描行為可控

**Acceptance Criteria:**
- [ ] 帳號啟用/停用/改角色即時生效
- [ ] 所有變更記入稽核日誌

**Maps to:** FR-101~104, FR-601 | Task: M5

---

**US-401：週期重掃與變更追蹤**
- **As an** admin
- **I want** 週期重掃 + 變更追蹤 + 站內通知
- **So that** 我能持續監看內網站台無障礙狀態並掌握差異

**Acceptance Criteria:**
- [ ] 依設定週期自動觸發重掃
- [ ] 與上次掃描差異分類正確（已修復/新增/未改）
- [ ] 完成/差異以站內通知呈現，無外網依賴

**Maps to:** FR-501, FR-502, FR-503 | Task: M6

---

## 6. 使用場景（Use Cases）

### UC-201：執行一次掃描

**參與者：** admin、API、佇列、worker、SQLite

**主要流程：**
1. admin 在 Portal 建立任務（URL/sitemap，白名單驗證通過）
2. API 寫入 jobs 表 → 回應任務已建立
3. worker 領取任務 → headless 渲染逐頁
4. 每頁注入 axe-core + HTMLCS → 整併去重 findings
5. WCAG 對應 + 嚴重度分級 + 站台分數
6. 結果寫入 DB，觸發報表產生（HTML/PDF/Excel）存入 volume
7. 站內通知完成；admin/viewer 檢視與下載

**異常流程：**
- E1 目標非白名單 → 拒絕（步驟 1）
- E2 頁面渲染逾時 → 標記該頁失敗，續掃其他頁，報表註記
- E3 worker 中途中斷 → 重啟後由 jobs 狀態續接（FR-206）

---

## 7. 資料模型概覽（Data Model）

| 實體 | 說明 | 主要屬性 | 關聯 |
|------|------|----------|------|
| `User` | 使用者 | id, username, password_hash, role(admin/viewer), status | 1:N → AuditLog |
| `ScanTask` | 掃描任務 | id, target, type(url/sitemap), status, created_by, created_at | 1:N → Page |
| `Job` | 佇列工作項 | id, scan_task_id, state(pending/running/done/failed/retry), attempts | N:1 → ScanTask |
| `Page` | 掃描頁面 | id, scan_task_id, url, render_status | 1:N → Issue |
| `Issue` | 問題 finding | id, page_id, engine, rule_code, wcag_ref, severity, selector, message | N:1 → Page |
| `Report` | 報表 | id, scan_task_id, lang, format(html/pdf/xlsx), path, created_at | N:1 → ScanTask |
| `AuditLog` | 稽核 | id, user_id, action, resource, ip, timestamp | N:1 → User |
| `Setting` | 系統設定 | key, value（白名單、速率、語言、排程、SMTP） | — |

**ScanTask 狀態機：**
```
[queued] --worker_pick--> [running] --done--> [completed]
[running] --error/timeout--> [failed]
[running] --interrupt--> [queued]  (重啟續接)
```

---

## 8. 介面規格（Interface Spec）

> `requires.uiux: true` → 詳見 `UIUX_SPEC.md`。

### 8.1 頁面清單

| 路由 | 頁面 | 存取權限 | 對應 US |
|------|------|----------|---------|
| `/login` | 登入 | Guest | US-301 |
| `/` | Dashboard（總覽/最近掃描） | Authenticated | US-202 |
| `/scans/new` | 建立掃描任務 | admin | US-201 |
| `/scans/:id` | 掃描結果 | Authenticated | US-202 |
| `/reports` | 報表清單/下載 | Authenticated | US-202 |
| `/settings` | 系統設定 | admin | US-301 |
| `/admin/users` | 帳號管理 | admin | US-301 |
| `/status` | 健康/狀態頁 | Authenticated | US-301 |

語言切換（zh-TW/en-US）於全站 header；深淺色 next-themes。

---

## 9. 限制與假設（Constraints & Assumptions）

### 9.1 技術限制
- 前端 React 19 + Vite + TS；後端 Node.js + TS（見 ADR-001）
- 資料庫 SQLite（WAL）+ 內嵌佇列（見 ADR-003）
- 部署 Docker Compose 單機、離線（見 ADR-002）
- **執行期無網際網路**

### 9.2 假設
- 掃描目標為內網、可由部署主機觸達的站台
- 流量為小型組織內部使用（低並發）
- 自動化檢測涵蓋率有限（約 30–57%，分母＝至少部分可機器測試的 WCAG 2.x A/AA 成功準則（success criteria）；此為業界估計、非保證），需人工複檢

### 9.3 依賴（皆離線打包，無外部服務）
| 依賴 | 用途 | 備援 |
|------|------|------|
| Playwright Chromium | 渲染 | 內建於映像 |
| axe-core / pa11y | 檢測引擎 | pin 版本 + 基準回歸 |
| Noto Sans TC / Inter | 報表/UI 字型 | 本地子集化 woff2 |

---

## 10. 追溯矩陣（Traceability Matrix）

| FR ID | 描述 | US ID | ADR ID | ROADMAP Task |
|-------|------|-------|--------|--------------|
| FR-101/102/103 | 本地帳號/RBAC/鎖定 | US-301 | ADR-006 | M5（T503，srs_refs 涵蓋 FR-102/103） |
| FR-104 | 稽核日誌 | US-301 | ADR-006 | M4（T402） |
| FR-201 | headless 渲染 | US-201 | ADR-001/002/007 | M1（T101） |
| FR-202/203 | axe-core + pa11y 整併 | US-201 | ADR-007 | M1（T102/T103） |
| FR-204 | sitemap 探索 | US-201 | ADR-002 | M1（T104） |
| FR-205 | 禮儀白名單 / 出站安全 | US-201 | ADR-009 | M1（T101，srs_refs 涵蓋 FR-205） |
| FR-206 | 背景佇列 | US-201 | ADR-003 | M4（T401） |
| FR-301 | WCAG 對應 | US-202 | ADR-007（governing） | M2（T201） |
| FR-302 | 嚴重度分級 | US-202 | ADR-007（governing） | M2（T202） |
| FR-303 | 涵蓋率標示 | US-202 | ADR-007（governing） | M2（T203） |
| FR-401/402/403 | HTML/PDF/Excel 報表 | US-202 | ADR-004/002 | M3（T301/T302/T303） |
| FR-404 | 報表儲存/下載 | US-202 | ADR-002/003 | M4（T403） |
| FR-501/502/503 | 排程/差異/通知 | US-401 | ADR-002 | M6（T601/T602/T603） |
| FR-601 | 系統設定 | US-301 | ADR-006 | M5（T505） |
| FR-602 | 本地健康/狀態頁 | US-301 | ADR-011 | M5（T507） |
| FR-603 | 資料保留與磁碟治理 | — | ADR-011 | M7（T705） |

---

## 附錄

### A. 變更歷史
| 版本 | 日期 | 變更摘要 | 作者 |
|------|------|----------|------|
| v0.1.0 | 2026-06-24 | 初版建立（由 SaaS 設計改寫為地端離線） | Accessify 維護者 |

### B. 相關文件
- [`SDS.md`](./SDS.md)、[`UIUX_SPEC.md`](./UIUX_SPEC.md)、[`DEPLOY_SPEC.md`](./DEPLOY_SPEC.md)
- [`docs/adr/`](./adr/)、[`ROADMAP.yaml`](../ROADMAP.yaml)
