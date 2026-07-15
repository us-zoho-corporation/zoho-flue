#!/usr/bin/env bash
# Stops the dev servers started by boot.sh and confirms the ports are free —
# a server left running is the single most common cause of the next layout
# check being flaky or silently testing stale code.
lsof -ti :3583 -ti :5173 2>/dev/null | xargs -r kill
sleep 1
if lsof -i :3583 -i :5173 >/dev/null 2>&1; then
  echo "Warning: :3583/:5173 still in use after kill:" >&2
  lsof -i :3583 -i :5173
  exit 1
fi
echo "Ports 3583 and 5173 are free."
