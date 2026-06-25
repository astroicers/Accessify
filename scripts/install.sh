#!/usr/bin/env bash
# Accessify 現場離線安裝（T702 / ADR-002/008）。docker load → 產生機密 → compose up → 等健康。
# 用法：ACCESSIFY_TAG=0.1.0 scripts/install.sh <accessify-image-*.tar.gz>
set -euo pipefail
dc() { docker compose "$@"; }

IMG_TAR="${1:?usage: ACCESSIFY_TAG=<tag> install.sh <accessify-image-*.tar.gz>}"
TAG="${ACCESSIFY_TAG:?ACCESSIFY_TAG required（須與映像 tag 一致）}"
ENV_FILE=".env"
SECRETS="./secrets"

echo "[install] 載入映像…"
docker load -i "$IMG_TAR"

echo "[install] 準備 .env…"
[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"
if grep -qE '^ACCESSIFY_TAG=' "$ENV_FILE"; then
  sed -i.bak "s/^ACCESSIFY_TAG=.*/ACCESSIFY_TAG=${TAG}/" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  echo "ACCESSIFY_TAG=${TAG}" >> "$ENV_FILE"
fi

echo "[install] 產生機密（0600；ADR-008，絕不入版控）…"
mkdir -p "$SECRETS"
chmod 700 "$SECRETS"
if [ ! -f "$SECRETS/cookie_secret" ]; then
  openssl rand -hex 32 > "$SECRETS/cookie_secret"
  chmod 600 "$SECRETS/cookie_secret"
fi
if [ ! -f "$SECRETS/tls_cert.pem" ] || [ ! -f "$SECRETS/tls_key.pem" ]; then
  echo "[install] 產生內網自簽 TLS（正式場域請以內部 CA 簽發取代）…"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout "$SECRETS/tls_key.pem" -out "$SECRETS/tls_cert.pem" \
    -subj "/CN=accessify.intra" >/dev/null 2>&1
  chmod 600 "$SECRETS/tls_key.pem"
  chmod 644 "$SECRETS/tls_cert.pem"
fi

echo "[install] 啟動 stack…"
dc up -d

echo "[install] 等待 api 與 worker 皆健康…"
ok=0
for _ in $(seq 1 30); do
  # -w：只計整詞 healthy（不誤計 unhealthy）。兩服務皆健康 → 2。
  if [ "$(dc ps --format '{{.Health}}' 2>/dev/null | grep -cw healthy)" -ge 2 ]; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  echo "[install] 健康檢查逾時（api/worker 未皆健康），請查：docker compose ps; docker compose logs"
  exit 1
fi

echo "[install] 完成。首位 admin 一次性密碼（請立即登入改密）："
echo "  docker compose logs api | grep 'initial admin password'"
echo "[install] 下一步：scripts/verify.sh 冒煙驗證；登入後於『設定』頁設定掃描白名單。"
