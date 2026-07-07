#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/config.yaml" ]; then
  cp config.example.yaml config.yaml
  echo "Created config.yaml — edit it before running."
fi

pnpm install

API_PORT="${MEDIA_INTERNAL_API_PORT:-8096}"

pnpm --filter @media-app/shared dev &
SHARED_PID=$!

MEDIA_API_ONLY=1 MEDIA_INTERNAL_API_PORT="$API_PORT" pnpm --filter @media-app/server dev &
SERVER_PID=$!

MEDIA_INTERNAL_API_PORT="$API_PORT" pnpm --filter @media-app/web dev &
WEB_PID=$!

trap "kill $SHARED_PID $SERVER_PID $WEB_PID 2>/dev/null" EXIT

echo ""
echo "Dev servers starting..."
echo "  Web (Next): http://localhost:3000"
echo "  API:        http://127.0.0.1:${API_PORT}"
echo ""

wait
