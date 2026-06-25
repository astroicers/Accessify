#!/usr/bin/env bash
# Accessify 離線安裝包（T702 / ADR-002）。於「有網建置環境」執行：建置 → docker save → 打包交付物。
# 用法：scripts/package-offline.sh [tag]
set -euo pipefail
TAG="${1:-${ACCESSIFY_TAG:-0.1.0}}"
IMAGE="accessify:${TAG}"
OUT="${OUT:-dist}"
mkdir -p "$OUT"

echo "[package] 建置映像 ${IMAGE}（runtime 階段）…"
DOCKER_BUILDKIT=1 docker build -t "$IMAGE" --target runtime .

echo "[package] docker save → gzip…"
docker save "$IMAGE" | gzip > "${OUT}/accessify-image-${TAG}.tar.gz"

echo "[package] 打包部署交付物（compose / scripts / docs）…"
tar -czf "${OUT}/accessify-deploy-${TAG}.tar.gz" \
  docker-compose.yml .env.example \
  scripts/install.sh scripts/verify.sh scripts/backup.sh scripts/restore.sh \
  scripts/upgrade.sh scripts/rollback.sh scripts/rotate-tls.sh \
  scripts/db-backup.mjs scripts/db-verify.mjs scripts/serve-fixtures.mjs \
  docs/RUNBOOK.md docs/ACCEPTANCE.md

echo "[package] 交付物："
ls -lh "${OUT}"/*.tar.gz
cat <<EOF

現場安裝（離線）：
  1) 解開 accessify-deploy-${TAG}.tar.gz
  2) ACCESSIFY_TAG=${TAG} scripts/install.sh accessify-image-${TAG}.tar.gz
  3) scripts/verify.sh   # 冒煙驗證
EOF
