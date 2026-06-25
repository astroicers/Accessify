#!/usr/bin/env bash
# Accessify 一致性備份（T703 / ADR-003/011）。
# SQLite Online Backup（絕不對使用中主檔 cp）+ reports + secrets，打包為單一 tar.gz。
# 需 stack 執行中（透過 worker 容器取一致快照）。用法：scripts/backup.sh [OUT_DIR]
set -euo pipefail
dc() { docker compose "$@"; }

OUT_DIR="${1:-${OUT_DIR:-./backups}}"
SECRETS_DIR="${SECRETS_DIR:-./secrets}"
TS="$(date +%Y%m%d-%H%M%S)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT_DIR"

echo "[backup] SQLite 一致快照（Online Backup API）…"
dc exec -T worker rm -f /data/.backup.db   # 清除前次中斷殘留
dc exec -T worker node scripts/db-backup.mjs /data/accessify.db /data/.backup.db
VERIFY="$(dc exec -T worker node scripts/db-verify.mjs /data/.backup.db)"
echo "[backup] ${VERIFY}"

echo "[backup] 取出快照與 reports…"
dc cp worker:/data/.backup.db "${STAGE}/accessify.db"
dc exec -T worker rm -f /data/.backup.db
dc cp worker:/reports "${STAGE}/reports"

# secrets（host bind mount；含 TLS 私鑰/簽章金鑰，保全權限）
if [ -d "$SECRETS_DIR" ]; then
  cp -a "$SECRETS_DIR" "${STAGE}/secrets"
  chmod -R go-rwx "${STAGE}/secrets"
fi

{ echo "$VERIFY"; date -u +"backup_utc=%Y-%m-%dT%H:%M:%SZ"; } > "${STAGE}/MANIFEST.txt"

ARCHIVE="${OUT_DIR}/accessify-backup-${TS}.tar.gz"
tar -C "$STAGE" -czf "$ARCHIVE" .
echo "[backup] → ${ARCHIVE}"
