# [ADR-012]: GHCR 連網側映像發布通道

| 欄位 | 內容 |
|------|------|
| **狀態** | `Draft` |
| **日期** | 2026-07-02 |
| **決策者** | Accessify 維護者 |

**狀態說明：** `Draft`（初稿，禁止實作）→ `FIRM`（POC 驗證，允許 commit，需附驗證證據）→ `Accepted`（人類審核通過）

> 📝 命名備註：「ADR-012」字樣曾於 v1.0.0 文件散文中被非正式保留給未來的「站內 SMTP 通知」決策
> （`.env.example`、CHANGELOG 1.0.0、release notes），但從未建立實際 ADR 檔案。本檔案正式佔用
> ADR-012 編號；活文件（`.env.example`）之保留字樣同步改為「待後續 ADR」，歷史紀錄（CHANGELOG
> 1.0.0 章節、`docs/releases/v1.0.0.md`）為既成紀錄不回改。

---

## 背景（Context）

v1.0.0 已交付。目前映像僅能由維護者於本機以 `scripts/package-offline.sh` ad-hoc 建置，存在以下問題：

- **無權威 artifact**：同一版本在不同機器建置的映像無法互證（image ID 不同），無「每版本一權威映像」的存證。
- **無稽核軌跡**：建置環境（Docker 版本、快取狀態、base 映像 tag 漂移）不可稽核、不可重現。
- **公車因子 = 1**：交付包產製依賴單一維護者的本機環境，與穩定優先原則矛盾。

同時，ADR-002 鐵則不變：**現場（軍網）執行期零對外**、交付維持 `docker save` tarball + 實體遞送。
因此需要的是一條**連網側**（建置/維護環境）的映像建置與版本管理通道，且該通道對現場**完全不可見**。

---

## 評估選項（Options Considered）

### 選項 A：GitHub Actions + GHCR 作為連網側建置/版本管理通道（採用）

以 GitHub Actions 於 push git tag `v*`（→ semver 標籤 + `latest`）與 push `main`（→ `edge` + `sha-*`）時
自動建置並推送至 `ghcr.io/astroicers/accessify`（**private**）。`scripts/package-offline.sh` 新增選用的
`PULL_GHCR=1` 模式：pull CI 權威映像 → retag 回 `accessify:<tag>` → 走原有 `docker save` 路徑。

**優點**：與既有 GitHub repo 零新增基礎設施；`GITHUB_TOKEN` 內建、免管理額外機密；tag 驅動、每版本
有權威映像與完整稽核軌跡（Actions log + package digest）；任何維護機皆可打出與 CI **同一 image ID**
的交付包；回滾可回溯任意歷史版本；現場流程與文件**零改動**。

**缺點**：連網側新增對 GitHub/GHCR 可用性的依賴（現場不受影響）；private package 需管理拉取權杖
（PAT `read:packages`）；GHCR 私有儲存有配額上限（個人帳號免費額度內，Chromium 映像約 1–2 GB/版，
需定期清理舊版）。

### 選項 B：維持現狀（僅本機建置）

**優點**：零改動。
**缺點**：上述背景三問題全數不解——無權威 artifact、建置漂移不可稽核、公車因子 = 1。與穩定優先
（可重現建置）矛盾，為主要否決理由。

### 選項 C：連網側自架 registry（Harbor / registry:2）

**優點**：完全自控、不依賴外部服務。
**缺點**：新增一套需長期維運（升級、備份、TLS、儲存）的服務，違反本專案「元件越少越好」原則；
GHCR 隨 repo 免維運即得同等能力。否決。

### 選項 D：GitHub Release assets 附掛映像 tarball

**優點**：與版本發布頁直接綁定。
**缺點**：單檔 2 GiB 上限對含 Chromium 的映像有超限風險；無 docker 原生 pull/digest 語意（無法
`docker pull` 驗證 digest）；無 `edge`/`sha` 中間版本可供連網側測試。否決。

---

## 決策（Decision）

採用**選項 A**，具體如下：

1. **發布 workflow**：新增 `.github/workflows/release-image.yml`（**不**修改 `ci.yml`——最小權限原則：
   僅發布 workflow 取得 `packages: write`，且 PR 觸發永不發布）。
   - 觸發：push tags `v*` → `X.Y.Z` + `X.Y` + `latest`（prerelease 自動不掛 `latest`）；push `main` →
     `edge`；一律附 `sha-<short>`；另備 `workflow_dispatch` 手動重跑。
   - 建置：`docker/build-push-action`，`target: runtime`、**僅 `linux/amd64`**（現場伺服器即 amd64
     Linux；不出貨未經測試的架構）、`provenance: false` / `sbom: false`（保持單一 manifest，簡化
     pull → save 離線打包路徑；未來若有供應鏈需求另立 ADR）、GitHub Actions layer cache。
   - OCI labels 由 `docker/metadata-action` 產生。
2. **可重現性**：`Dockerfile` base 依 ADR-002 既有要求 pin `node:22-bookworm-slim@sha256:<digest>`
   （移上 CI 建置後，tag 漂移成為真實風險；升版須改 digest 並記錄於 CHANGELOG）。
3. **compose 相容**：`docker-compose.yml` 改為 `image: ${ACCESSIFY_IMAGE:-accessify}:${ACCESSIFY_TAG:-local}`。
   現場保持預設（`docker load` 後即 `accessify:<tag>`）；`ACCESSIFY_IMAGE` 僅供連網側直接以 GHCR
   映像測試，**現場嚴禁設定為 ghcr.io**。
4. **離線打包整合**：`PULL_GHCR=1 scripts/package-offline.sh <tag>` pull → retag → save；預設模式
   （本機建置）行為完全不變。
5. **現場零可見**：GHCR 僅出現於 DEPLOY_SPEC（連網側章節）、README 與本 ADR。RUNBOOK、
   `install.sh`、`upgrade.sh`、`rollback.sh`、ACCEPTANCE **零 GHCR 引用**（以 grep 驗證）。
6. **可見性**：GHCR package 設為 **private**（軍網場域工具）；維護機拉取使用 PAT（`read:packages`）。

---

## 後果（Consequences）

**正面：**
- 每版本有權威映像（單一 image ID/digest）與 CI 稽核軌跡；任何維護機可產製一致的交付包。
- 回滾／重出貨可回溯任意歷史版本，不再依賴單一本機的 Docker 快取。
- base digest pin 後建置可重現性提升，符合 ADR-002 穩定優先。

**負面 / 取捨：**
- 連網側新增 GitHub/GHCR 可用性依賴；GHCR 全面故障時 fallback 為既有本機建置模式（預設路徑保留即為此故障備援）。
- private package 的 PAT 發放/輪替成為新的維運項目（限連網側，現場無感）。
- CI runner 自 Docker Hub 拉取 base 映像可能遇 rate limit；緩解：digest pin 使重試具確定性，必要時
  後續加 Docker Hub 登入（另議）。
- GHCR 儲存配額需定期清理舊版 package versions（保留近 N 版 + 所有正式版）。

---

## 成功指標（Success Metrics）

- push git tag 後 ≤ 15 分鐘，GHCR 出現對應 semver 標籤；push main 後出現 `edge`。
- `PULL_GHCR=1` 打包產出之映像 image ID 與 GHCR 上該 tag 的 digest 一致。
- 現場乾淨機以該交付包執行 `install.sh` + `verify.sh` 全數通過，流程與 v1.0.0 完全相同。
- `grep -ril ghcr docs/RUNBOOK.md docs/ACCEPTANCE.md scripts/install.sh scripts/upgrade.sh scripts/rollback.sh` 為空。

---

## 關聯（Related）

- ADR-002（air-gapped 地端交付與穩定性）— 本 ADR 為其**連網側**補充，現場約束不變
- ADR-009（Chromium sandbox 與掃描器出站安全）— 映像內容不因發布通道改變
- DEPLOY_SPEC §2（部署架構；新增連網側發布通道小節）
- ROADMAP M9（T901–T903）

---

## Verification Evidence

（待填——升級 FIRM/Accepted 時附：首次 workflow 執行連結、GHCR package 頁截圖、`PULL_GHCR=1` 打包
之 image ID 與 GHCR digest 比對輸出）
