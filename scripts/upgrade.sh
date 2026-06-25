#!/usr/bin/env bash
# Accessify 離線升級（T703 / ADR-002）。升級前強制備份（失敗即中止）；保留前一版 tag 供一鍵回滾。
# 遷移為 expand-contract，由 entrypoint 啟動時自動套用。用法：scripts/upgrade.sh <new-image.tar.gz> <new-tag>
set -euo pipefail
dc() { docker compose "$@"; }

IMG_TAR="${1:?usage: upgrade.sh <new-image.tar.gz> <new-tag>}"
NEW_TAG="${2:?new tag required}"
ENV_FILE="${ENV_FILE:-.env}"

echo "[upgrade] 1) 強制備份（失敗即中止升級）…"
scripts/backup.sh ./backups

echo "[upgrade] 2) 記錄目前 tag 供回滾…"
CUR_TAG="$(grep -E '^ACCESSIFY_TAG=' "$ENV_FILE" | cut -d= -f2- || echo local)"
echo "$CUR_TAG" > .accessify-prev-tag

echo "[upgrade] 3) 載入新映像…"
docker load -i "$IMG_TAR"

echo "[upgrade] 4) 切換 tag 並啟動（遷移於 entrypoint 自動套用）…"
sed -i.bak "s/^ACCESSIFY_TAG=.*/ACCESSIFY_TAG=${NEW_TAG}/" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
dc up -d

echo "[upgrade] 5) 等待 api 與 worker 皆健康…"
ok=0
for _ in $(seq 1 30); do
  if [ "$(dc ps --format '{{.Health}}' 2>/dev/null | grep -cw healthy)" -ge 2 ]; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  echo "[upgrade] 健康檢查失敗 → 請執行 scripts/rollback.sh（相容）或 scripts/rollback.sh <升級前備份>（不相容）"
  exit 1
fi
echo "[upgrade] done（前一版 tag=${CUR_TAG}；舊映像保留以供回滾）"
