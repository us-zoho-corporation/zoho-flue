---
name: run-agent
description: Run, test, type-check, and lint the Flue agent in this project. Use when starting the agent, passing a prompt, debugging startup errors, running the test suite, or verifying code quality before committing.
compatibility: Requires pnpm and Node.js
allowed-tools: Bash Read
---

## Running the assistant agent

`assistant`'s tools require a real signed-in session (secrets `app.ts` bootstraps
at startup, the user's Zoho connection) — `flue run` never runs `app.ts`, so it
crashes immediately on any prompt to this agent, even one needing no tools at
all. Use the real dev server instead:

```bash
# Terminal 1 — agent server (port 3583, vite dev via the flue() plugin)
pnpm dev

# Terminal 2 — Vite chat UI (port 5173, proxies /agents and /api to :3583)
pnpm chat
```

Open `http://localhost:5173`, or drive it directly (`ENV=local` enables the
dev-login seam — no real Zoho OAuth needed):

```bash
curl -s -c /tmp/cookies.txt "http://localhost:3583/api/auth/dev-login?userId=demo&email=demo@example.com&name=Demo"
curl -s -b /tmp/cookies.txt -X POST http://localhost:3583/agents/assistant/demo-conv-1 \
  -H "Content-Type: application/json" \
  -d '{"kind":"user","body":"what is 12 * 34?"}'
```

The provider-model is selected per conversation (see the chat UI's picker, or
carry `<modelKey>__<id>` as the conversation id in the URL above); default is
`claude` (`anthropic/claude-sonnet-5`), currently the only option. See
[docs/examples.md](../../../docs/examples.md) for more prompts, including KB
search (requires the docs knowledge base connected — Settings → Connections).

`assistantMiddleware` (registered ahead of the agent mount in `src/app.ts`)
does the conversation-ownership claim and per-turn request-context population
that a real HTTP request needs; this is why `flue run` — which loads only the
target agent module, never `app.ts` — can't provide it.

## Running a from-scratch agent

A newly added agent with no such session dependency (see the `add-agent`
skill) works fine with `flue run`:

```bash
pnpm exec flue run src/agents/<name>.ts --message "hello"
```

## Quality checks

```bash
pnpm test                       # unit tests (node)
pnpm test:watch                 # unit tests in watch mode
pnpm test:smoke                 # smoke tests (requires live API credentials)
pnpm test:browser               # optional: React component tests in headless Chromium
pnpm typecheck                  # tsc --noEmit (no output = clean)
pnpm lint                       # oxlint src/
```

The suites are Vitest `projects` in one `vitest.config.ts`, selected with `--project`:
`unit` (node — the default `pnpm test`), `browser` (`*.browser.test.tsx` via Playwright +
headless Chromium), and `smoke` (live credentials). One-time for browser:
`pnpm exec playwright install chromium`.

## Common startup errors

| Error | Cause | Fix |
|---|---|---|
| `Missing required environment variable: X` | `.env` missing or incomplete | Fill all required vars (activate `zoho-oauth` skill) |
| `flue run` crashes with `DATA_ENCRYPTION_KEY is empty` | Expected — `assistant` needs a real session, which `flue run` can't provide | Use `pnpm dev` + `pnpm chat` (or curl) instead, per above |
| KB tools fail / `ConnectionRequiredPayload` | Docs knowledge base not connected for this user, or `DOCS_OAUTH_CLIENT_ID` unset | Connect it in Settings → Connections; check `.env` |
| Persistent 401 on API calls | Bad OAuth credentials | Check `ZOHO_OAUTH_*` values in `.env` |
