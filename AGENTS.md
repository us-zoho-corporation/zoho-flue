# zoho-flue

Exploratory repository for building LLM agents on the [Flue](https://flueframework.com/) framework backed by Zoho's AI infrastructure (Catalyst QuickML GLM).

## Agents

Agents live in [`src/agents/`](src/agents/). Each filename is the agent name passed to `flue run`.

## Docs

- [Setup](docs/setup.md) — OAuth credentials, .env, adding agents and providers
- [Commands](docs/commands.md) — run, build, type-check, lint
- [Examples](docs/examples.md) — example prompts per agent
- [Architecture](docs/architecture.md) — component map and conventions
- [Providers](docs/providers.md) — Catalyst GLM response format, tool call quirks, zoho-auth
- [MCP Clients](docs/mcp-clients.md) — zoho-kb connection pattern, why direct SDK
- [Environment](docs/environment.md) — required `.env` variables
