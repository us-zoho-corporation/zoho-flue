---
name: run-agent
description: Run, test, type-check, and lint the Flue agent in this project. Use when starting the agent, passing a prompt, debugging startup errors, running the test suite, or verifying code quality before committing.
compatibility: Requires pnpm and Node.js
allowed-tools: Bash Read
---

## Running an agent

```bash
pnpm exec flue run <path-to-agent-module.ts> --message "your prompt"
pnpm build                      # compile to dist/ (vite build)
pnpm dev                        # watch-mode dev server on :3583 (vite dev)
```

The single agent is `Assistant` (`src/agents/assistant.ts`, storage identity pinned to
`assistant` via `Assistant.agentName`); the provider-model is selected per conversation
(see the chat UI, or pass `--id '<modelKey>__<id>'` to `flue run`; default is `claude`,
currently the only option — `anthropic/claude-sonnet-5`). Example inputs:

```bash
pnpm exec flue run src/agents/assistant.ts --message "fetch all open leads from Zoho CRM and summarize them"
pnpm exec flue run src/agents/assistant.ts --message "get the first page of contacts from Zoho CRM and count them"
pnpm exec flue run src/agents/assistant.ts --message "what is 12 * 34?"
```

KB search tools (`zoho_kb_search`, `zoho_kb_get_page`, `zoho_kb_list_products`) are only available when `ZOHO_DOCS_BEARER_TOKEN` is set in `.env`:

```bash
pnpm exec flue run src/agents/assistant.ts --message "search zoho docs for how to create a CRM custom function"
pnpm exec flue run src/agents/assistant.ts --message "list all available zoho documentation products"
```

## Quality checks

```bash
pnpm test                       # unit tests (node)
pnpm test:watch                 # unit tests in watch mode
pnpm test:smoke                 # smoke tests (requires live API credentials)
pnpm test:browser               # optional: React component tests in headless Chromium
pnpm exec tsc --noEmit          # type-check (no output = clean)
pnpm exec oxlint src/           # lint all source
```

The suites are Vitest `projects` in one `vitest.config.ts`, selected with `--project`:
`unit` (node — the default `pnpm test`), `browser` (`*.browser.test.tsx` via Playwright +
headless Chromium), and `smoke` (live credentials). One-time for browser:
`pnpm exec playwright install chromium`.

## Chat UI (browser interface)

The agent exposes an HTTP API via `src/app.ts`, which explicitly mounts it with
`app.route(ASSISTANT_MOUNT_PATH, createAgentRouter(Assistant))`. Run the dev server and
the Vite chat app in two separate terminals:

```bash
# Terminal 1 — agent server (port 3583, vite dev via the flue() plugin)
pnpm dev

# Terminal 2 — Vite chat UI (port 5173, proxies /agents → :3583)
pnpm chat
```

Open `http://localhost:5173` in the browser. The chat UI talks to the `assistant` agent; the composer's model picker selects the provider-model, carried on the conversation id as `<modelKey>__<uuid>`.

**Requirement:** the agent's HTTP surface depends on `src/app.ts` explicitly mounting it
(`createAgentRouter(Assistant)`) — there's no automatic mounting in Flue v2. It currently
does, ahead of which `assistantMiddleware` runs (conversation-ownership claim + per-turn
request-context population) — see `src/agents/assistant.ts`.

## Common startup errors

| Error | Cause | Fix |
|---|---|---|
| `Missing required environment variable: X` | `.env` missing or incomplete | Fill all required vars (activate `zoho-oauth` skill) |
| KB tools fail / 401 from KB MCP | `ZOHO_DOCS_BEARER_TOKEN` invalid or expired | Re-issue via browser OAuth at `https://help-docs.zoho-forge.com/authorize` |
| Persistent 401 on API calls | Bad OAuth credentials | Check `ZOHO_OAUTH_*` values in `.env` |
