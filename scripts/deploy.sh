#!/usr/bin/env bash
# Deploy script — runs on the Hetzner server via GitHub Actions SSH.
# Pulls latest code, rebuilds Docker image, health-checks, rolls back on failure.
set -euo pipefail

APP_DIR="/var/www/open-hikmah"
COMPOSE="docker compose"

cd "$APP_DIR"

echo "==> Pulling latest code from main..."
git pull origin main

echo "==> Tagging current image as :previous (for rollback)..."
docker tag open-hikmah-app:latest open-hikmah-app:previous 2>/dev/null || true

echo "==> Building new image and starting containers..."
$COMPOSE up -d --build

echo "==> Waiting for health check (up to 60s)..."
HEALTHY=false
for i in $(seq 1 12); do
  sleep 5
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    HEALTHY=true
    echo "Health check passed on attempt $i"
    break
  fi
  echo "  Attempt $i/12 — not ready yet"
done

if [ "$HEALTHY" = "true" ]; then
  echo "==> Deployment successful."
  # Clean up the previous image to save disk space
  docker image prune -f --filter "label!=keep" 2>/dev/null || true
  exit 0
fi

echo "==> Health check failed — rolling back to :previous image..."
$COMPOSE stop app
docker tag open-hikmah-app:previous open-hikmah-app:latest
$COMPOSE up -d --no-build app

echo "==> Rollback complete. Check logs: docker compose logs app"
exit 1
