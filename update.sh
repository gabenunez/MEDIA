#!/usr/bin/env bash
# Reel one-line updater
#
#   curl -fsSL https://raw.githubusercontent.com/gabenunez/reel/main/update.sh | bash
#
# Options (env vars):
#   REEL_INSTALL_DIR=/opt/reel
#   REEL_BRANCH=main
#   REEL_NONINTERACTIVE=1

set -euo pipefail

REEL_REPO="${REEL_REPO:-https://github.com/gabenunez/reel.git}"
REEL_BRANCH="${REEL_BRANCH:-main}"
REEL_INSTALL_DIR="${REEL_INSTALL_DIR:-/opt/reel}"

resolve_source_dir() {
  if [[ -n "${REEL_SOURCE_DIR:-}" ]] && [[ -f "${REEL_SOURCE_DIR}/scripts/update.sh" ]]; then
    printf '%s' "$REEL_SOURCE_DIR"
    return 0
  fi

  if [[ "${BASH_SOURCE[0]:-}" != "${0:-}" ]] && [[ -f "${BASH_SOURCE[0]:-}" ]]; then
    local candidate
    candidate="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$candidate/scripts/update.sh" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  fi

  if [[ -f "./scripts/update.sh" ]]; then
    printf '%s' "$(pwd)"
    return 0
  fi

  return 1
}

SOURCE_DIR=""
if SOURCE_DIR="$(resolve_source_dir)"; then
  export REEL_SOURCE_DIR="$SOURCE_DIR"
  exec bash "$SOURCE_DIR/scripts/update.sh" "$@"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. On Ubuntu/Debian: sudo apt update && sudo apt install -y git"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

git clone --depth 1 --branch "$REEL_BRANCH" "$REEL_REPO" "$TMP_DIR/reel"

export REEL_SOURCE_DIR="$TMP_DIR/reel"
export REEL_INSTALL_DIR
exec bash "$TMP_DIR/reel/scripts/update.sh" "$@"
