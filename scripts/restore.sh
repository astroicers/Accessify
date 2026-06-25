#!/usr/bin/env bash
# Accessify 還原（T703）。從備份 tar 還原 SQLite + reports（+ secrets）。會停止再啟動 stack。
# 還原前必先驗證備份完整性（quick_check）。用法：scripts/restore.sh <backup.tar.gz>
set -euo pipefail
dc() { docker compose "$@"; }

ARCHIVE="${1:?usage: restore.sh <backup.tar.gz>}"
SECRETS_DIR="${SECRETS_DIR:-./secrets}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

tar -C "$STAGE" -xzf "$ARCHIVE"
[ -f "${STAGE}/accessify.db" ] || { echo "[restore] 無效備份：缺 accessify.db"; exit 1; }

echo "[restore] 驗證備份完整性（一次性容器，免依賴 host node）…"
dc run --rm -T -v "${STAGE}:/restore:ro" worker node scripts/db-verify.mjs /restore/accessify.db

echo "[restore] 停止 stack…"
dc down

echo "[restore] 原子寫回 data / reports（named volume）…"
# 先寫 temp 再驗證再 atomic mv：cp 中斷不會毀掉現有 /data/accessify.db（同檔系統 mv 為原子）。
dc run --rm -T -v "${STAGE}:/restore:ro" worker sh -c '
  cp /restore/accessify.db /data/.restore.tmp &&
  node scripts/db-verify.mjs /data/.restore.tmp &&
  mv -f /data/.restore.tmp /data/accessify.db &&
  rm -f /data/accessify.db-wal /data/accessify.db-shm &&
  rm -rf /reports/* &&
  if [ -d /restore/reports ]; then cp -a /restore/reports/. /reports/; fi'

if [ -d "${STAGE}/secrets" ]; then
  echo "[restore] 還原 secrets…"
  mkdir -p "$SECRETS_DIR"
  cp -a "${STAGE}/secrets/." "$SECRETS_DIR/"
fi

echo "[restore] 重新啟動…"
dc up -d
echo "[restore] done"
