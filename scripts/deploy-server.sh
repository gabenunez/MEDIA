#!/usr/bin/env bash
#
# Deploy MEDIA! to a remote server over SSH — one command, reliable.
#
# It SSHes to the host, fast-forwards the checkout to the target ref, then runs
# the robust `restart-prod.sh --rebuild` on the server. That restart stops the
# old stack by *listening socket* (not fragile pkill), rebuilds with the right
# MEDIA_PUBLIC_PREFIX, and starts a fresh supervisor — so a stale old process
# can never keep serving after a deploy.
#
# Usage:
#   scripts/deploy-server.sh [user@host] [remote_dir] [git_ref]
#
# Defaults come from env so nothing secret is committed:
#   MEDIA_DEPLOY_HOST     e.g. user@host        (required if no arg)
#   MEDIA_DEPLOY_DIR      remote app dir         (default: /opt/media-app)
#   MEDIA_DEPLOY_REF      branch or tag          (default: main)
#   MEDIA_DEPLOY_SSH      ssh command override   (default: ssh)
#
# Password auth: set SSHPASS and MEDIA_DEPLOY_SSH="sshpass -e ssh".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ui.sh
source "$ROOT/scripts/lib/ui.sh" 2>/dev/null || true

HOST="${1:-${MEDIA_DEPLOY_HOST:-}}"
REMOTE_DIR="${2:-${MEDIA_DEPLOY_DIR:-/opt/media-app}}"
REF="${3:-${MEDIA_DEPLOY_REF:-main}}"
SSH_CMD="${MEDIA_DEPLOY_SSH:-ssh}"

if [[ -z "$HOST" ]]; then
  echo "Usage: scripts/deploy-server.sh [user@host] [remote_dir] [git_ref]" >&2
  echo "  or set MEDIA_DEPLOY_HOST (and optionally MEDIA_DEPLOY_DIR/REF)." >&2
  exit 1
fi

step() { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$1"; }

step "Deploying ref '$REF' to $HOST:$REMOTE_DIR"

# Everything runs in one remote shell. set -e so any step failing aborts the
# deploy (and the old server keeps running rather than ending up half-updated).
# shellcheck disable=SC2087
$SSH_CMD -o ConnectTimeout=25 "$HOST" REMOTE_DIR="$REMOTE_DIR" REF="$REF" 'bash -s' <<'REMOTE'
set -euo pipefail
export PATH="${HOME}/node/bin:${PATH:-}"

cd "$REMOTE_DIR" || { echo "Remote dir $REMOTE_DIR not found" >&2; exit 1; }

echo "== fetch + checkout $REF =="
# Fetch the exact ref (branch or tag) into FETCH_HEAD and hard-reset onto it.
# This is robust even when the checkout is in detached HEAD with no
# remote-tracking refs (how seedbox clones often end up), which plain
# `checkout origin/<ref>` can't handle.
git fetch --tags --force origin "$REF"
git reset --hard FETCH_HEAD
echo "now at: $(git log --oneline -1)"

echo "== restart with rebuild (socket-truth stop, correct prefix, fresh start) =="
bash scripts/restart-prod.sh --rebuild

echo "== wait for health =="
PORT="$(awk '/^server:/{f=1} f&&/^  port:/{print $2; exit}' config.yaml 2>/dev/null)"
PORT="${PORT:-8096}"
API_PORT=$((PORT + 1))
ok=""
for _ in $(seq 1 60); do
  if curl -sf -m 3 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1 \
     && curl -sf -m 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 1
done
if [ -z "$ok" ]; then
  echo "HEALTH CHECK FAILED — api :$API_PORT / gateway :$PORT not responding" >&2
  exit 1
fi
echo "healthy: api :$API_PORT + gateway :$PORT"

# Confirm the freshly started API process is actually new (not a stale one).
echo "running: $(ps -eo etime,cmd | grep '[d]ist/index.js' | head -1 | sed 's/^ *//')"
REMOTE

step "Deploy complete — $HOST is now on '$REF'"
