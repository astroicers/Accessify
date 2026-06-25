# Accessify base 映像（ADR-002 地端離線 / ADR-009 Chromium 容器安全）
#
# 原則：建置於「有網環境」一次抓齊所有資產（npm 相依、Chromium、字型）；
#       產出映像以 `docker save` 交付，現場 `docker load` 後**執行期零對外請求**。
# 可重現：base 以固定 tag（正式交付請改 pin @sha256 digest）、相依以 package-lock.json pin。
#
# 注意：Playwright Chromium 二進位於 M1/T101 加入 scanner 相依後，由下方標註處安裝；
#       本階段已備妥 Chromium 所需 OS 函式庫與 CJK 字型，使 base 即 Chromium-ready。

# ---- base：runtime 共用層（Node + 字型 + tini + Chromium OS 函式庫）----
FROM node:22-bookworm-slim AS base
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

# ---- deps：離線可重現安裝（lockfile pin；含原生模組 better-sqlite3 prebuilt）----
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages ./packages
# npm ci 嚴格依 lockfile；正式離線建置改 `npm ci --offline`（需先 vendor cache，見 scripts/vendor-offline.sh）。
RUN npm ci
# Chromium（Playwright）：scanner/report/worker 執行期相依。於「有網建置環境」抓取並 pin revision；
# OS 函式庫已於 base 裝齊，故此處只取瀏覽器二進位（執行期零對外，ADR-002/009）。
RUN npx playwright install chromium

# ---- build：TypeScript 編譯 ----
FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
RUN npm run build

# ---- runtime：非 root、tini entrypoint、零對外請求 ----
FROM base AS runtime
RUN useradd --system --uid 10001 --create-home accessify
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /ms-playwright /ms-playwright
COPY --from=build /app/packages /app/packages
COPY package.json ./
# 預建並 chown data/reports 掛載點：Docker 初始化空 named volume 時會沿用映像內該目錄的擁有者，
# 故非 root（uid 10001）首啟即可寫入 SQLite(WAL) 與報表（否則 root:root 空 volume → EACCES）。
RUN mkdir -p /data /reports && chown accessify:accessify /data /reports
USER accessify
# 實際 api / worker 的啟動指令由 docker-compose（T701）指定；此處僅提供 reaping entrypoint。
ENTRYPOINT ["tini", "--"]
CMD ["node", "--version"]
