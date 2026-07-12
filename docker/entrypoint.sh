#!/usr/bin/env bash
#
# Container entrypoint for MEDIA!.
#
# Responsibilities:
#   - Seed a default config on first run into the mounted /config volume.
#   - Force container-friendly data/cache locations so nothing is written into
#     the (read-only) image layer.
#   - Hand off to the production supervisor (scripts/start-prod.sh).
#
set -euo pipefail

CONFIG_DIR="${MEDIA_CONFIG_DIR:-/config}"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
DATA_DIR="${MEDIA_DATA_DIR:-/data}"

mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$DATA_DIR/transcode-cache"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "[media] No config found at $CONFIG_FILE — writing default."
  cat > "$CONFIG_FILE" <<EOF
# MEDIA! configuration — most options are also editable in the web UI (/settings).
server:
  port: ${MEDIA_PORT:-8096}
  host: 0.0.0.0
  # public_prefix: /media   # set when served behind a reverse proxy subpath

# Add libraries here OR from Settings in the web UI. Paths must match the
# container-side mount points from your docker-compose volumes (e.g. /media/...).
libraries: []

metadata:
  # Get a free key at https://www.themoviedb.org/settings/api
  tmdb_api_key: "${TMDB_API_KEY:-}"
  language: "${MEDIA_LANGUAGE:-en-US}"

subtitles:
  opensubtitles_api_key: "${OPENSUBTITLES_API_KEY:-}"

transcoding:
  enabled: true
  hls_segment_duration: 6
  cache_dir: $DATA_DIR/transcode-cache

data_dir: $DATA_DIR

auth:
  password_hash: ""
EOF
fi

# The server resolves config.yaml relative to CWD (walking upward). Point it at
# the mounted config by symlinking into the app root, without clobbering a real
# file if one was baked in.
APP_ROOT="/app"
if [[ ! -e "$APP_ROOT/config.yaml" ]]; then
  ln -sf "$CONFIG_FILE" "$APP_ROOT/config.yaml"
fi

# In-container update flow marks this install as containerized so the in-app
# updater surfaces the correct guidance (pull a new image, don't self-git-pull).
export MEDIA_CONTAINER=1

exec bash "$APP_ROOT/scripts/start-prod.sh"
