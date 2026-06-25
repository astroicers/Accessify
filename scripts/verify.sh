#!/usr/bin/env bash
# Accessify 部署冒煙驗證（T702/T704）。檢查健康、OpenAPI 契約、SPA 首頁、（選用）登入。
# 完整「掃描→中文 PDF」端到端需白名單 fixture（見 docs/ACCEPTANCE.md）。
# 用法：APP_PORT=8443 [ADMIN_PW=...] scripts/verify.sh
set -euo pipefail
PORT="${APP_PORT:-8443}"
BASE="https://127.0.0.1:${PORT}"
# -k：內網自簽 TLS；-f：HTTP >= 400 視為失敗（避免非 2xx 誤判 PASS）。
curlq() { curl -kfsS --max-time 10 "$@"; }

echo "[verify] /healthz…"
curlq "${BASE}/healthz" | grep -q '"status":"ok"' || { echo "FAIL: healthz"; exit 1; }

echo "[verify] OpenAPI 契約…"
curlq "${BASE}/api/openapi.json" | grep -q '"openapi"' || { echo "FAIL: openapi"; exit 1; }

echo "[verify] Portal 首頁（SPA 同容器服務）…"
curlq "${BASE}/" | grep -qi '<!doctype html' || { echo "FAIL: spa index"; exit 1; }

if [ -n "${ADMIN_PW:-}" ]; then
  echo "[verify] 登入…"
  # 密碼經 stdin（--data @-）傳入，避免出現在程序清單/argv。
  printf '{"username":"%s","password":"%s"}' "${ADMIN_USERNAME:-admin}" "${ADMIN_PW}" \
    | curlq -X POST "${BASE}/api/auth/login" -H 'content-type: application/json' --data @- \
    | grep -q '"token"' || { echo "FAIL: login"; exit 1; }
  echo "[verify] 登入 OK"
fi

echo "[verify] PASS"
echo "[verify] 端到端掃描→中文 PDF：見 docs/ACCEPTANCE.md（需白名單 fixture 主機）。"
