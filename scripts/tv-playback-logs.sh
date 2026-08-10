#!/usr/bin/env bash
#
# Pull Android TV playback diagnostics (MediaPlaybackDiag + related tags).
#
# Usage:
#   ./scripts/tv-playback-logs.sh              # live tail
#   ./scripts/tv-playback-logs.sh --dump       # last ~30 min buffered logcat, then exit
#   ./scripts/tv-playback-logs.sh --clear      # clear logcat buffer
#   ./scripts/tv-playback-logs.sh 10.0.0.184   # specific device
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ui.sh
if [[ -f "$ROOT/scripts/lib/ui.sh" ]]; then
  # optional pretty output — script still works without it
  source "$ROOT/scripts/lib/ui.sh" 2>/dev/null || true
fi

ADB="$(command -v adb || true)"
if [[ -z "$ADB" ]]; then
  echo "Error: adb not found on PATH" >&2
  exit 1
fi

MODE="tail"
DEVICE=""
for arg in "$@"; do
  case "$arg" in
    --dump) MODE="dump" ;;
    --clear) MODE="clear" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) DEVICE="$arg" ;;
  esac
done

ADB_ARGS=()
if [[ -n "$DEVICE" ]]; then
  if [[ "$DEVICE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    DEVICE="${DEVICE}:5555"
  fi
  ADB_ARGS=(-s "$DEVICE")
fi

TAGS='MediaPlaybackDiag:I MediaNativePlayer:W MediaNativePlayer:E ExoPlayerImpl:W *:S'

case "$MODE" in
  clear)
    "$ADB" "${ADB_ARGS[@]}" logcat -c
    echo "Cleared logcat buffer."
    ;;
  dump)
    echo "# TV playback diagnostics dump ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
    echo "# Filter: $TAGS"
    echo "#"
    "$ADB" "${ADB_ARGS[@]}" logcat -d -v threadtime $TAGS
    ;;
  tail)
    echo "Tailing playback diagnostics (Ctrl-C to stop)…"
    echo "Filter: $TAGS"
    echo
    "$ADB" "${ADB_ARGS[@]}" logcat -v threadtime $TAGS
    ;;
esac
