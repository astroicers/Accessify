#!/usr/bin/env bash
# Accessify 一鍵回滾（T703 / ADR-002）。兩類（見 docs/RUNBOOK.md 遷移相容性標記）：
#   相容遷移：scripts/rollback.sh                  → 僅切回前一版映像 tag，資料保留。
#   不相容遷移：scripts/rollback.sh <備份.tar.gz>   → 還原升級前備份 + 切回前一版 tag（接受升級後新資料遺失，符合語意）。
set -euo pipefail
dc() { docker compose "$@"; }

ENV_FILE="${ENV_FILE:-.env}"
PREV_TAG="$(cat .accessify-prev-tag 2>/dev/null || echo '')"
[ -n "$PREV_TAG" ] || { echo "[rollback] 找不到 .accessify-prev-tag（無升級記錄，無法回滾）"; exit 1; }

# 先切回前一版 tag，再還原 → restore 的容器/啟動皆以「舊映像」進行，
# 不會讓新映像對剛還原的舊備份重跑遷移（否則不相容遷移會毀掉還原內容）。
echo "[rollback] 切回前一版映像 tag=${PREV_TAG} …"
sed -i.bak "s/^ACCESSIFY_TAG=.*/ACCESSIFY_TAG=${PREV_TAG}/" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"

if [ -n "${1:-}" ]; then
  echo "[rollback] 不相容回滾：還原備份 $1 （以舊映像）…"
  scripts/restore.sh "$1"
else
  dc up -d
fi
echo "[rollback] done（tag=${PREV_TAG}）"
