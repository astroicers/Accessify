#!/usr/bin/env bash
# Accessify 映像建置（ADR-002 可重現）。於「有網環境」執行；產出供離線交付。
set -euo pipefail
IMAGE="${IMAGE:-accessify:0.1.0}"

# 可重現性：Dockerfile base 已 pin @sha256 index digest（ADR-002/012；升版見 .asp-fact-check.md FC-003）。
DOCKER_BUILDKIT=1 docker build -t "$IMAGE" .

echo "built: $IMAGE"
echo "離線交付：docker save \"$IMAGE\" | gzip > accessify-${IMAGE##*:}.tar.gz"
