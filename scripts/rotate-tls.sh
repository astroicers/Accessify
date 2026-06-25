#!/usr/bin/env bash
# Accessify 內網 TLS 憑證輪替（T706 / ADR-008）。替換 ./secrets/tls_*，強制重建 api 容器以重讀憑證。
# 用法：
#   scripts/rotate-tls.sh <cert.pem> <key.pem>   # 以內部 CA 簽發之憑證輪替（建議）
#   scripts/rotate-tls.sh --self-signed          # 重新產生自簽（過渡用）
set -euo pipefail
dc() { docker compose "$@"; }
SECRETS="${SECRETS:-./secrets}"
mkdir -p "$SECRETS"
chmod 700 "$SECRETS"

if [ "${1:-}" = "--self-signed" ]; then
  echo "[rotate-tls] 產生新自簽憑證…"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout "$SECRETS/tls_key.pem" -out "$SECRETS/tls_cert.pem" -subj "/CN=accessify.intra" >/dev/null 2>&1
else
  CERT="${1:?usage: rotate-tls.sh <cert.pem> <key.pem> | --self-signed}"
  KEY="${2:?key required}"
  [ -f "$CERT" ] && [ -f "$KEY" ] || { echo "[rotate-tls] cert/key 檔不存在"; exit 1; }
  # 驗證 key 與 cert 相符（比對公鑰，與金鑰型別無關：RSA/EC/Ed25519 皆適用）。
  cpub="$(openssl x509 -noout -pubkey -in "$CERT" 2>/dev/null)"
  kpub="$(openssl pkey -pubout -in "$KEY" 2>/dev/null)"
  [ -n "$cpub" ] && [ -n "$kpub" ] || { echo "[rotate-tls] 無法讀取 cert/key 公鑰，中止"; exit 1; }
  [ "$cpub" = "$kpub" ] || { echo "[rotate-tls] cert 與 key 不相符，中止"; exit 1; }
  cp "$CERT" "$SECRETS/tls_cert.pem"
  cp "$KEY" "$SECRETS/tls_key.pem"
fi
chmod 600 "$SECRETS/tls_key.pem"
chmod 644 "$SECRETS/tls_cert.pem"

echo "[rotate-tls] 強制重建 api 容器以套用新憑證（worker 不受影響）…"
dc up -d --force-recreate --no-deps api
echo "[rotate-tls] done（/api/status 將回報新的憑證剩餘天數）"
