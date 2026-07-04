#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/config.yaml" ]; then
  cp config.example.yaml config.yaml
  echo "Created config.yaml — edit it before running."
fi

pnpm install

# Run server and web dev in parallel
pnpm --filter @media-app/shared dev &
SHARED_PID=$!

pnpm --filter @media-app/server dev &
SERVER_PID=$!

NEXT_PUBLIC_API_URL=http://localhost:8096 pnpm --filter @media-app/web dev &
WEB_PID=$!

trap "kill $SHARED_PID $SERVER_PID $WEB_PID 2>/dev/null" EXIT

echo ""
echo "Dev servers starting..."
echo "  API + static: http://localhost:8096 (after server builds shared)"
echo "  Web dev UI:   http://localhost:3000"
echo ""

wait
