#!/usr/bin/env bash
# Runs on every Codespace start (postStartCommand), independent of the editor/browser attaching.
# Starts the app in the background (detached) unless it is already running. Log: /tmp/omw-dev.log
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ] || [ ! -d node_modules ]; then
  bash .devcontainer/setup.sh || exit 0
fi

if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
  echo "On My Way is already running on port 3000"
  exit 0
fi

# Apply any new migrations from the latest code (additive only), then start detached.
npx prisma migrate deploy >/tmp/omw-migrate.log 2>&1 || true
setsid nohup npm run dev >/tmp/omw-dev.log 2>&1 < /dev/null &
echo "Starting On My Way on port 3000 (log: /tmp/omw-dev.log)"
