---
name: e2e-chat
description: Run a full browser end-to-end test of the chat UI from an authenticated empty state, without real Zoho OAuth. Use to verify the signed-in flow — login, send/response, conversation switching mid-run, the stop button, and logout — after changing the chat, auth, agent, or store code, or before committing.
compatibility: Requires pnpm, Node.js, a headless Chromium (Playwright), and ANTHROPIC_API_KEY in .env
allowed-tools: Bash Read
---

## What this does

Exercises the whole signed-in chat flow in a real browser, starting from an
**authenticated empty state** (a fake user with no chats) — the state that real
Zoho OAuth can't produce in CI or a sandbox. It relies on a gated dev-login seam.

## The dev-login seam

`GET /api/auth/dev-login` mints a real session (via the same `issueSession` the
Zoho callback uses) for a fake user — default `dev-user` / `dev@example.com` /
"Dev User", with a placeholder refresh token. It is **only** mounted when
`ENV=local` or `ENV=CI`; any other value (or unset) returns `404`. Never enable in
production. Optional query params: `userId`, `email`, `name`, `returnTo` (same-origin only),
`scopes` (comma/space-separated, unioned with the base scopes — simulates an
already-connected product, e.g. `scopes=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,...`
for testing the `zoho_api`/`check_zoho_connection` gate as a connected user,
without a real Zoho OAuth round-trip).

Because the fake refresh token can't be exchanged with Zoho, a dev user works for
the default **Claude** model and empty-state UX, but not for `/api/photo` (it
calls `getUserToken`, which needs a real grant). The E2E uses Claude — the only
selectable model.

## Run it

```bash
bash .claude/skills/e2e-chat/scripts/e2e.sh
```

`e2e.sh` sets `ENV=local` + `STORE_BACKEND=memory` (a clean in-memory store for a
true empty state), boots the agent server (:3583, via `vite dev`) and the Vite chat
(:5173), waits for both, runs the Playwright driver, then tears the servers down and
propagates the driver's exit code. It prints `PASS`/`FAIL` per check and a final
failure count.

The driver (`scripts/run-e2e.mjs`) walks: dev-login → assert authenticated empty
state (welcome + fake user, no chats) → send a prompt and assert a response
renders → open a new chat mid-flow and switch back, asserting the response
persisted with no error → assert the stop button aborts a run → sign out and
assert the login screen returns and the local chat list is cleared.

## Gotchas

- **Ports must be free.** The harness refuses to run if `:3583` or `:5173` is
  already listening (a stale dev server causes flaky, misleading results — stop
  it first). It owns the servers it starts and kills them on exit.
- **Needs `ANTHROPIC_API_KEY`** in `.env` — the default `claude` model produces the
  turn the response checks assert on. Without it, those checks FAIL (the script warns).
- **One-time browser install:** `pnpm exec playwright install chromium`.
- The driver hard-exits (a live SSE stream can otherwise keep Node alive); tune with
  `E2E_HARD_TIMEOUT_MS`. Target a different origin with `E2E_BASE_URL`.
- Sanity: with `ENV` unset, `curl -sI localhost:3583/api/auth/dev-login` returns `404`.
- **The dev server's file watcher (`vite dev`, via the `flue()` plugin) covers
  the whole repo tree, including `.claude/`** — so editing a script already
  sitting in `scripts/` (not just the first copy) triggers a reload, and if
  that lands while a conversation is mid-turn, it can kill the in-flight
  request or, after a few edits in quick succession, wedge the server
  entirely (a rebuild/runtime-drain failure repeating on every subsequent
  file change, never recovering on its own). Finalize a script's content in
  your scratchpad first, copy it into `scripts/` *once*, then don't touch
  that file again until the run finishes — if you need to fix it, edit the
  scratchpad copy and copy it over fresh rather than patching the one
  already in `scripts/`. If you ever see that rebuild-failure loop in the
  server log, stop retrying against it — kill the wedged dev-server process
  and start fresh (`e2e.sh` does this itself each run; if you're driving the
  servers manually instead, see the `layout-check` skill's
  `boot.sh`/`teardown.sh`) rather than waiting it out.
