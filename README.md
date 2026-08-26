# zoho-flue

Exploratory repository for building LLM agents on the [Flue](https://flueframework.com/) framework for Zoho CRM/Desk implementation work.

## Quick start

```bash
pnpm install
```

Populate `.env` — see [Setup](docs/setup.md) for credentials and OAuth.

Run the app (two terminals):

```bash
pnpm dev    # agent server on :3583
pnpm chat   # chat UI on :5173 (proxies to :3583)
```

`pnpm exec flue run src/agents/assistant.ts --message "..."` does **not** work for
this agent — its tools require a real signed-in session (`app.ts`'s secrets
bootstrap, the user's Zoho connection), which only exists behind the real HTTP
server above. `flue run` is fine for a from-scratch agent with no such
dependency; see [Commands](docs/commands.md).

## Docs

- [Setup](docs/setup.md) — OAuth credentials, `.env`, adding agents and providers
- [Commands](docs/commands.md) — run, build, type-check, lint, test
- [Testing](docs/testing.md) — test framework, default vs. flagged suites
- [Examples](docs/examples.md) — example prompts per agent
- [Architecture](docs/architecture.md) — project structure, providers, auth pattern
- [a2ui](docs/a2ui.md) — generative UI streaming (charts, tables, metric cards)
- [Environment](docs/environment.md) — required `.env` variables
