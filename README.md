# zoho-flue

Exploratory repository for building LLM agents on the [Flue](https://flueframework.com/) framework for Zoho CRM/Desk implementation work.

## Quick start

```bash
pnpm install
```

Populate `.env` — see [Setup](docs/setup.md) for credentials and OAuth.

Run the assistant agent from the CLI:

```bash
pnpm exec flue run src/agents/assistant.ts --message "hello"
```

Or use the browser chat UI (two terminals):

```bash
pnpm dev    # agent server on :3583
pnpm chat   # chat UI on :5173 (proxies to :3583)
```

## Docs

- [Setup](docs/setup.md) — OAuth credentials, `.env`, adding agents and providers
- [Commands](docs/commands.md) — run, build, type-check, lint, test
- [Testing](docs/testing.md) — test framework, default vs. flagged suites
- [Examples](docs/examples.md) — example prompts per agent
- [Architecture](docs/architecture.md) — project structure, providers, auth pattern
- [a2ui](docs/a2ui.md) — generative UI streaming (charts, tables, metric cards)
- [Environment](docs/environment.md) — required `.env` variables
