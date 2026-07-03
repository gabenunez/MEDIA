#!/usr/bin/env bash
# Remove Reel transcode and build caches. Safe to run while Reel is stopped;
# if Reel is running, only stale transcode dirs (>6h, not active) are removed
# when using --live mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${REEL_DATA_DIR:-$ROOT/data}"
TRANSCODE_DIR="${REEL_TRANSCODE_DIR:-$DATA_DIR/transcode-cache}"
LIVE=0

if [[ "${1:-}" == "--live" ]]; then
  LIVE=1
fi

freed_kb=0
add_freed() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  local kb
  kb="$(du -sk "$path" | cut -f1)"
  rm -rf "$path"
  freed_kb=$((freed_kb + kb))
}

if [[ "$LIVE" -eq 1 ]]; then
  mapfile -t ACTIVE < <(pgrep -af 'ffmpeg.*transcode-cache' 2>/dev/null | grep -oE 'transcode-cache/[^/[:space:]]+' | sed 's|transcode-cache/||' | sort -u || true)
  cutoff="$(date -d '6 hours ago' +%s 2>/dev/null || date -v-6H +%s)"
  for dir in "$TRANSCODE_DIR"/*; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    for active in "${ACTIVE[@]:-}"; do
      [[ "$name" == "$active" ]] && continue 2
    done
    mtime="$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir")"
    [[ "$mtime" -lt "$cutoff" ]] || continue
    echo "Removing stale transcode session: $name"
    add_freed "$dir"
  done
else
  echo "Removing all transcode cache in $TRANSCODE_DIR"
  add_freed "$TRANSCODE_DIR"
  mkdir -p "$TRANSCODE_DIR"
fi

echo "Removing build caches"
add_freed "$ROOT/.turbo/cache"
add_freed "$ROOT/packages/web/.next"

if command -v sqlite3 >/dev/null && [[ -f "$DATA_DIR/reel.db" ]]; then
  sqlite3 "$DATA_DIR/reel.db" "PRAGMA wal_checkpoint(TRUNCATE);"
  echo "SQLite WAL checkpoint complete"
fi

echo "Freed approximately $((freed_kb / 1024)) MB"
