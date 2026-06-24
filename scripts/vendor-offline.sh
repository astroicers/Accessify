#!/usr/bin/env bash
# 離線相依 vendoring（ADR-002）。於「有網環境」執行一次，產出可離線重建的 npm cache，
# 供現場 / CI 以 `npm ci --offline --cache <dir>` 建置（含 better-sqlite3 prebuilt）。
# Playwright Chromium 二進位由映像層內建（Dockerfile），不在此 cache 範圍。
set -euo pipefail
CACHE="${CACHE:-vendor-offline/npm-cache}"
mkdir -p "$CACHE"

# 以 lockfile 精確還原並填充指定 cache。
npm ci --cache "$CACHE"

echo "vendored npm cache → $CACHE"
echo "離線建置：npm ci --offline --cache \"$CACHE\""
