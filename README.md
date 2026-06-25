# zoho-flue

Exploratory repository for building LLM agents on the [Flue](https://flueframework.com/) framework backed by Zoho's AI infrastructure (Catalyst QuickML GLM).

## Quick start

```bash
pnpm install
```

Populate `.env` — see [Setup](docs/setup.md) for credentials and OAuth.

Run the main agent from the CLI:

```bash
pnpm exec flue run main --input '{"message":"hello"}'
```

Or use the browser chat UI (two terminals):

```bash
pnpm exec flue dev   # agent server on :3583
pnpm chat            # chat UI on :5173 (proxies to :3583)
```

## Docs

- [Setup](docs/setup.md) — OAuth credentials, `.env`, adding agents and providers
- [Commands](docs/commands.md) — run, build, type-check, lint, test
- [Examples](docs/examples.md) — example prompts per agent
- [Architecture](docs/architecture.md) — project structure, providers, auth pattern
- [Environment](docs/environment.md) — required `.env` variables
