#!/usr/bin/env bash
# Boots the app dev server (:3583) + the Vite chat (:5173) for live layout verification,
# using the same ENV=local / STORE_BACKEND=memory dev-login seam as e2e-chat
# (see .agents/skills/e2e-chat/SKILL.md) — no real Zoho OAuth needed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

for port in 3583 5173; do
  if lsof -i ":$port" >/dev/null 2>&1; then
    echo "Port $port is already in use — a stale server gives flaky, misleading measurements. Stop it first (lsof -i :$port)." >&2
    exit 1
  fi
done

LOG_DIR="${TMPDIR:-/tmp}/layout-check"
mkdir -p "$LOG_DIR"
FLUE_LOG="$LOG_DIR/flue-dev.log"
CHAT_LOG="$LOG_DIR/chat-dev.log"

(STORE_BACKEND=memory ENV=local pnpm exec vite dev --port 3583 --strictPort > "$FLUE_LOG" 2>&1 &)
(pnpm chat > "$CHAT_LOG" 2>&1 &)

for _ in $(seq 1 30); do
  c1=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3583/health 2>/dev/null || echo 000)
  c2=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo 000)
  if [ "$c1" = "200" ] && [ "$c2" = "200" ]; then
    echo "Ready — flue:3583 chat:5173"
    echo "Logs: $FLUE_LOG , $CHAT_LOG"
    exit 0
  fi
  sleep 1
done

echo "Servers did not become healthy within 30s. Logs: $FLUE_LOG , $CHAT_LOG" >&2
exit 1
