#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./update.sh            # defaults to current checked-out branch
#   ./update.sh main       # update from a specific branch

APP_DIR="/var/www/GridSurvivalWebsite"
APP_NAME="grid-survival"

cd "$APP_DIR"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "[1/5] Fetching latest code from origin/$BRANCH..."
git fetch origin "$BRANCH"

echo "[2/5] Pulling latest commits..."
git pull --ff-only origin "$BRANCH"

echo "[3/5] Installing production dependencies..."
npm ci --omit=dev

echo "[4/5] Restarting PM2 app..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi

echo "[5/5] Saving PM2 process list..."
pm2 save

echo "Update complete."