#!/usr/bin/env bash
# Boots the Flue dev server + the Vite chat UI, runs the browser E2E driver against
# an authenticated empty state (via the ENV=local dev-login seam), then tears both
# servers down. Exits with the driver's status. Run from anywhere.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$REPO_ROOT"

FLUE_PORT=3583
CHAT_PORT=5173
LOG_DIR="$(mktemp -d)"
FLUE_LOG="$LOG_DIR/flue.log"
CHAT_LOG="$LOG_DIR/chat.log"
FLUE_PID=""
CHAT_PID=""

# The dev-login seam is gated on ENV; a fresh in-memory store gives a clean empty state.
export ENV="${ENV:-local}"
export STORE_BACKEND="${STORE_BACKEND:-memory}"

cleanup() {
  local code=$?
  [[ -n "$FLUE_PID" ]] && kill "$FLUE_PID" 2>/dev/null
  [[ -n "$CHAT_PID" ]] && kill "$CHAT_PID" 2>/dev/null
  # Give them a moment, then hard-kill anything still holding the ports.
  sleep 1
  [[ -n "$FLUE_PID" ]] && kill -9 "$FLUE_PID" 2>/dev/null
  [[ -n "$CHAT_PID" ]] && kill -9 "$CHAT_PID" 2>/dev/null
  exit "$code"
}
trap cleanup EXIT INT TERM

fail() { echo "[e2e] $*" >&2; exit 1; }

# Refuse to run if the ports are already taken — a stale flue dev on :3583 causes
# flaky, misleading results. Ask the operator to stop it rather than killing it.
port_busy() { lsof -ti tcp:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_busy "$FLUE_PORT" && fail "port $FLUE_PORT is in use — stop the running flue dev server first."
port_busy "$CHAT_PORT" && fail "port $CHAT_PORT is in use — stop the running Vite server first."

if ! grep -q '^ANTHROPIC_API_KEY=.\+' .env 2>/dev/null && [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "[e2e] WARNING: ANTHROPIC_API_KEY not set — the default 'claude' model can't answer, so response checks will FAIL." >&2
fi

wait_for() { # url, name, tries
  local url="$1" name="$2" tries="${3:-60}"
  for ((i = 0; i < tries; i++)); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then echo "[e2e] $name ready"; return 0; fi
    sleep 1
  done
  return 1
}

echo "[e2e] repo: $REPO_ROOT (ENV=$ENV, STORE_BACKEND=$STORE_BACKEND)"
echo "[e2e] logs: $LOG_DIR"

echo "[e2e] starting flue dev on :$FLUE_PORT …"
pnpm exec flue dev >"$FLUE_LOG" 2>&1 &
FLUE_PID=$!
wait_for "http://localhost:$FLUE_PORT/health" "flue dev" 90 || { tail -n 40 "$FLUE_LOG" >&2; fail "flue dev did not become ready"; }

echo "[e2e] starting chat UI on :$CHAT_PORT …"
pnpm chat >"$CHAT_LOG" 2>&1 &
CHAT_PID=$!
wait_for "http://localhost:$CHAT_PORT/" "chat UI" 60 || { tail -n 40 "$CHAT_LOG" >&2; fail "chat UI did not become ready"; }

echo "[e2e] running driver …"
node "$SCRIPT_DIR/run-e2e.mjs"
