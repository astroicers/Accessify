# [ADR-009]: 容器內 Chromium sandbox 與掃描器出站安全

| 欄位 | 內容 |
|------|------|
| **狀態** | `Accepted` |
| **日期** | 2026-06-24 |
| **決策者** | Accessify 維護者 |

**狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）
> ⬆️ 由 `Draft` 升 `Accepted`：使用者 2026-06-24 透過 `/asp:approve-adr` 呼叫、看完本次升級指令呈現之決策摘要與 Verification Evidence 狀態（待填——bootstrap 階段尚無 POC 可驗證）後，明確同意全部 11 份直升（人類顯式授權，非 AI 自行升級，符合 ADR 狀態變更鐵則）。

---

## 背景（Context）

worker 容器以 Playwright 驅動 Chromium，對使用者指定之內網目標站台進行掃描（注入 axe-core / pa11y）。此情境同時帶來兩類風險：

1. **容器內 Chromium 穩定性**：headless Chromium 在容器中常見問題包含 `/dev/shm` 過小導致崩潰、PID1 無法回收殭屍行程（zombie reaping）、以 root 執行擴大攻擊面、壞頁面（無窮重導、巨大回應、JS 卡死）拖垮整個 worker。

2. **掃描器出站安全（SSRF）**：掃描器本質上會主動對「使用者控制之 URL」發出請求，是典型的 SSRF 載具。在軍用內網（air-gapped）中，雖無對外網際網路，但仍須防止掃描器被誘導存取**未授權之內網主機、容器自身網段、雲端 metadata 端點（169.254.x.x）、loopback、本機檔案（file://）**。重導與 sub-resource（圖片、CSS、JS、字型等）會繞過僅在「初始 URL」做的單點檢查，必須在每個出站請求層強制白名單。

產品定位 stability-first，現場服務緩慢，因此「壞頁面隔離、容器自動重啟、出站零越界」是核心穩定性與安全需求。

---

## 評估選項（Options Considered）

### 選項 A：保留 sandbox + init/shm 強化 + 出站請求層白名單強制（route 攔截）

- **優點**：保留 Chromium user-namespace + seccomp sandbox（最強隔離）；`init: true`（tini）做 PID1 reaping；`--disable-dev-shm-usage` 或 `shm_size: '1gb'` 解決崩潰；非 root user 降低攻擊面。SSRF 防護在**每個出站請求**（Playwright route 攔截）強制白名單，對 redirect 後最終 URL 與所有 sub-resource 主機重新校驗，並做解析後 IP 黑名單，覆蓋面最完整。
- **缺點**：route 攔截 + 每請求重新校驗有實作與少量效能成本；部分現場若核心限制 user-namespace 可能須改 `--no-sandbox` 並補償。
- **風險**：白名單校驗若僅在初始 URL 做會被 redirect/子資源繞過 → 以「每個出站請求強制」緩解。

### 選項 B：僅初始 URL 校驗 + 預設 `--no-sandbox`（最省事）

- **優點**：實作最簡單；`--no-sandbox` 相容性最高。
- **缺點**：初始 URL 校驗無法防 redirect / sub-resource SSRF；停用 sandbox 後若頁面 JS 逃逸，攻擊面顯著放大。對軍用內網不可接受。
- **風險**：SSRF 越界存取內網主機 / metadata；安全基線不足。

### 選項 C：以容器外部網路層（egress firewall / 反向代理白名單）取代應用層校驗

- **優點**：集中管控，應用層無須改動。
- **缺點**：現場網路設定變異大、不可移植；無法辨識 application-level 語意（如最終 redirect 主機）；違反「交付即可重現」（ADR-002）的封裝原則。
- **風險**：依賴現場網路設定，部署一致性差。

---

## 決策（Decision）

採 **選項 A：保留 sandbox + init/shm 強化 + 出站請求層白名單強制**。

### 1. 容器與行程（worker）

- `init: true`（tini）做 PID1 reaping，回收殭屍行程。
- `--disable-dev-shm-usage` 或 `shm_size: '1gb'`，避免 `/dev/shm` 過小造成 Chromium 崩潰。
- 以**非 root user** 執行容器。

### 2. sandbox 策略

- **優先保留** Chromium user-namespace + seccomp sandbox。
- 若現場限制（核心未開放 user-namespace）需 `--no-sandbox`，**必須記錄補償措施**：網路 egress 封鎖、資源上限、容器隔離。

### 3. 出站／SSRF 強制（核心）

- 白名單在**每個出站請求**層強制（Playwright route 攔截），而非僅初始 URL。
- 對 **redirect 後之最終 URL** 與**所有 sub-resource 主機**重新校驗。
- **解析後 IP 黑名單**：loopback、link-local（169.254.0.0/16）、容器網段、未列白名單之 RFC1918。
- **禁用 `file://`**。

### 4. 資源上限

- 每頁 navigation timeout；每任務總時長與最大頁數上限。
- context 記憶體 / 逾時即 **kill + 重啟**。
- 重導次數上限；回應大小上限。
- **單頁失敗隔離**，不可拖垮整個 worker；佇列續行。

---

## 後果（Consequences）

**正面影響：**
- 容器內 Chromium 穩定（reaping / shm / 非 root）；SSRF 在每請求層、含 redirect 與子資源全面攔截；壞頁面逾時即殺、佇列續行，符合 stability-first。

**負面影響 / 技術債：**
- route 攔截與每請求校驗增加實作複雜度與少量效能成本；`--no-sandbox` 補償路徑須在 runbook 明確記載並審查。

**後續追蹤：**
- [ ] worker 容器 init/shm/非 root 設定（呼應 ROADMAP T004 / T701）。
- [ ] 出站白名單 route 攔截 + redirect/子資源校驗 + IP 黑名單 + 禁 file://（ROADMAP T101）。
- [ ] 資源上限與單頁隔離、容器崩潰自動重啟。

---

## 成功指標（Success Metrics）

| 指標 | 目標值 | 驗證方式 | 檢查時間 |
|------|--------|----------|----------|
| 出站越界 | 非白名單（含 redirect / 子資源）出站 = 0 命中 | route 攔截單元/整合測試 + redirect/子資源 fixtures | M1 |
| 壞頁面隔離 | 逾時即殺且佇列續行 | 注入卡死/重導/巨量回應頁面測試 | M1 |
| 容器韌性 | Chromium 崩潰自動重啟 | 故障注入測試 | M1 |
| IP 黑名單 | loopback/link-local/容器網段/未列白名單 RFC1918 全部阻擋；`file://` 阻擋 | 各黑名單目標逐項測試 | M1 |
| sandbox 補償 | 若 `--no-sandbox`，補償措施（egress 封鎖/資源上限/隔離）已記載 | runbook 與設定審查 | 上線前 |

---

## 關聯（Relations）

- 參考：ADR-002（air-gapped 地端交付與穩定性）、ADR-007（掃描引擎與授權）、SRS.md（FR-205）、ROADMAP（T004 / T101 / T701）

---

## Verification Evidence（升級至 FIRM 時必填）

| 欄位 | 內容 |
|------|------|
| **POC 分支 / 測試結果** | （待填） |
| **驗證日期** | YYYY-MM-DD |
| **驗證者** | （待填） |
| **驗證摘要** | （待填） |
