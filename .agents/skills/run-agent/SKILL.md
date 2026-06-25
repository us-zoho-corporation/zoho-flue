---
name: run-agent
description: Run, test, type-check, and lint the Flue agent in this project. Use when starting the agent, passing a prompt, debugging startup errors, running the test suite, or verifying code quality before committing.
compatibility: Requires pnpm and Node.js
allowed-tools: Bash Read
---

## Running an agent

```bash
pnpm exec flue run <agent> --input '{"message":"your prompt"}'
pnpm exec flue build            # compile to dist/
pnpm exec flue dev              # watch-mode dev server on :3583
```

The default agent is `main`. Example inputs:

```bash
pnpm exec flue run main --input '{"message":"fetch all open leads from Zoho CRM and summarize them"}'
pnpm exec flue run main --input '{"message":"get the first page of contacts from Zoho CRM and count them"}'
pnpm exec flue run main --input '{"message":"what is 12 * 34?"}'
```

KB search tools (`zoho_kb_search`, `zoho_kb_get_page`, `zoho_kb_list_products`) are only available when `ZOHO_DOCS_TOKEN` is set in `.env`:

```bash
pnpm exec flue run main --input '{"message":"search zoho docs for how to create a CRM custom function"}'
pnpm exec flue run main --input '{"message":"list all available zoho documentation products"}'
```

## Quality checks

```bash
pnpm test                       # unit tests
pnpm test:watch                 # unit tests in watch mode
pnpm test:smoke                 # smoke tests (requires live API credentials)
pnpm exec tsc --noEmit          # type-check (no output = clean)
pnpm exec oxlint src/           # lint all source
```

## Chat UI (browser interface)

The agent exposes an HTTP API via `src/app.ts`. Run the dev server and the Vite chat app in two separate terminals:

```bash
# Terminal 1 — Flue dev server (port 3583)
pnpm exec flue dev

# Terminal 2 — Vite chat UI (port 5173, proxies /agents → :3583)
pnpm chat
```

Open `http://localhost:5173` in the browser. The chat UI talks to the `main` agent with conversation ID `default`.

**Requirement:** `src/agents/main.ts` must export `route` for the HTTP API to be reachable. It currently does — `export const route: AgentRouteHandler = async (_c, next) => next();`.

## Common startup errors

| Error | Cause | Fix |
|---|---|---|
| `Missing required environment variable: X` | `.env` missing or incomplete | Fill all required vars (activate `zoho-oauth` skill) |
| `ZOHO_DOCS_TOKEN has expired` | JWT expired after 7 days | Re-run browser OAuth at `https://help-docs.zoho-forge.com/authorize` |
| Persistent 401 on API calls | Bad OAuth credentials | Check `ZOHO_OAUTH_*` values in `.env` |
