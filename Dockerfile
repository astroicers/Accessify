# Accessify base 映像（ADR-002 地端離線 / ADR-009 Chromium 容器安全）
#
# 原則：建置於「有網環境」一次抓齊所有資產（npm 相依、Chromium、字型）；
#       產出映像以 `docker save` 交付，現場 `docker load` 後**執行期零對外請求**。
# 可重現：base 已 pin @sha256 index digest（ADR-002/012；升版須改 digest 並記錄於 CHANGELOG 與
#         .asp-fact-check.md FC-003）、相依以 package-lock.json pin。
#
# 注意：Playwright Chromium 二進位於 M1/T101 加入 scanner 相依後，由下方標註處安裝；
#       本階段已備妥 Chromium 所需 OS 函式庫與 CJK 字型，使 base 即 Chromium-ready。

# ---- base：runtime 共用層（Node + 字型 + tini + Chromium OS 函式庫）----
FROM node:22-bookworm-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4 AS base
ENV TZ=Asia/Taipei \
    NODE_ENV=production \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# CJK（報表 PDF 完整字型，UIUX_SPEC §1.3）+ 拉丁字型；tini 做 PID1 reaping（ADR-009）；
# Chromium 執行所需 OS 函式庫（headless 渲染）。一次裝齊，執行期不再 apt。
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-core \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- deps：建置期完整安裝（lockfile pin；含 devDeps）----
# 必須 --include=dev：base 的 NODE_ENV=production 會讓 npm ci 略過 devDeps，但
# (1) build stage 需要 tsc/vite（devDeps）；
# (2) `playwright` bin 名與 root devDeps 的 @playwright/test 衝突，lockfile 將 .bin/playwright
#     分配給後者——略過 devDeps 會使 bin link 消失（首次 CI 建置實證，見 ADR-012 Verification）。
# runtime 的 production-only node_modules 由下方 proddeps stage 另行安裝。
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages ./packages
# npm ci 嚴格依 lockfile；正式離線建置改 `npm ci --offline`（需先 vendor cache，見 scripts/vendor-offline.sh）。
RUN npm ci --include=dev
# Chromium（Playwright）：scanner/report/worker 執行期相依。於「有網建置環境」抓取並 pin revision；
# OS 函式庫已於 base 裝齊，故此處只取瀏覽器二進位（執行期零對外，ADR-002/009）。
RUN npx playwright install chromium

# ---- build：TypeScript 編譯 ----
FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
RUN npm run build

# ---- proddeps：runtime 專用 production-only 依賴（不含 devDeps，映像最小化）----
# runtime 只 require('playwright') 模組（瀏覽器二進位在 /ms-playwright），不需 CLI bin，
# 故 production 安裝下 bin link 缺失無影響。
FROM base AS proddeps
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev

# ---- runtime：非 root、tini entrypoint、零對外請求 ----
FROM base AS runtime
RUN useradd --system --uid 10001 --create-home accessify
COPY --from=proddeps /app/node_modules /app/node_modules
COPY --from=deps /ms-playwright /ms-playwright
COPY --from=build /app/packages /app/packages
COPY package.json ./
# 備份/還原（Online Backup API，T703）與選用驗收 fixture sidecar（T704）所需的 node 輔助。
COPY scripts/db-backup.mjs scripts/db-verify.mjs scripts/serve-fixtures.mjs ./scripts/
# 預建並 chown data/reports 掛載點：Docker 初始化空 named volume 時會沿用映像內該目錄的擁有者，
# 故非 root（uid 10001）首啟即可寫入 SQLite(WAL) 與報表（否則 root:root 空 volume → EACCES）。
RUN mkdir -p /data /reports && chown accessify:accessify /data /reports
USER accessify
# 實際 api / worker 的啟動指令由 docker-compose（T701）指定；此處僅提供 reaping entrypoint。
ENTRYPOINT ["tini", "--"]
CMD ["node", "--version"]
