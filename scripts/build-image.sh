#!/usr/bin/env bash
# Accessify 映像建置（ADR-002 可重現）。於「有網環境」執行；產出供離線交付。
set -euo pipefail
IMAGE="${IMAGE:-accessify:0.1.0}"

# 可重現性：正式交付請以固定 base digest（@sha256:...）取代 node:22 tag，
# 並設 BuildKit reproducible 選項（SOURCE_DATE_EPOCH 等，見 ADR-002）。
DOCKER_BUILDKIT=1 docker build -t "$IMAGE" .

echo "built: $IMAGE"
echo "離線交付：docker save \"$IMAGE\" | gzip > accessify-${IMAGE##*:}.tar.gz"
