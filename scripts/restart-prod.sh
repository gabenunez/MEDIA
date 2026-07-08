#!/usr/bin/env bash
# Stop MEDIA!, optionally rebuild for a new public URL prefix, then start again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/ui.sh
source "$ROOT/scripts/lib/ui.sh"

REBUILD=false
if [[ "${1:-}" == "--rebuild" ]]; then
  REBUILD=true
fi

read_config_public_prefix() {
  local config="$ROOT/config.yaml"
  if [[ -f "$config" ]]; then
    awk '/^server:/{found=1} found && /^  public_prefix:/{gsub(/"/, "", $2); print $2; exit}' "$config"
  fi
}

stop_running_reel() {
  local pid_file pid config_dir
  config_dir="$(media_config_dir)"
  pid_file="$config_dir/reel.pid"
  pid=""
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
  elif [[ -f "${HOME}/.config/media-app/reel.pid" ]]; then
    pid_file="${HOME}/.config/media-app/reel.pid"
    pid="$(cat "$pid_file" 2>/dev/null || true)"
  elif [[ -f "${HOME}/.config/reel/reel.pid" ]]; then
    pid_file="${HOME}/.config/reel/reel.pid"
    pid="$(cat "$pid_file" 2>/dev/null || true)"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    sleep 2
  fi
  pkill -f "node packages/server/dist/index.js" 2>/dev/null || true
  pkill -f "packages/web/.next/standalone/packages/web/server.js" 2>/dev/null || true
  pkill -f "scripts/start-prod.sh" 2>/dev/null || true
  sleep 1
  rm -f "${HOME}/.config/media-app/reel.pid" "${HOME}/.config/reel/reel.pid"
}

start_running_reel() {
  if [[ -f /etc/systemd/system/reel.service ]] && systemctl list-unit-files reel.service &>/dev/null; then
    if [[ -n "${MEDIA_SUDO:-}" ]]; then
      $MEDIA_SUDO systemctl restart reel.service
    else
      systemctl restart reel.service
    fi
    return 0
  fi

  if [[ -x "${HOME}/.startup/reel" ]]; then
    "${HOME}/.startup/reel"
    return 0
  fi

  local config_dir pid_file
  config_dir="$(media_config_dir)"
  mkdir -p "$config_dir"
  pid_file="$config_dir/reel.pid"
  export PATH="${HOME}/node/bin:${PATH:-}"
  nohup bash scripts/start-prod.sh >> "$config_dir/reel.log" 2>&1 &
  echo $! > "$pid_file"
}

# Let the settings API response flush before we stop the server.
sleep 2

PUBLIC_PREFIX="$(read_config_public_prefix || true)"
export MEDIA_PUBLIC_PREFIX="${PUBLIC_PREFIX}"

if [[ "$REBUILD" == "true" ]]; then
  export PATH="${HOME}/node/bin:${PATH:-}"
  rm -rf packages/web/.next packages/web/.turbo packages/web/out
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  export TURBO_FORCE=1
  if [[ -n "${PUBLIC_PREFIX}" ]]; then
    export MEDIA_PUBLIC_PREFIX="${PUBLIC_PREFIX}"
  else
    unset MEDIA_PUBLIC_PREFIX
  fi
  pnpm --filter @media-app/shared build
  pnpm --filter @media-app/server build
  (cd packages/web && node scripts/with-api-for-build.mjs)
fi

stop_running_reel
start_running_reel
