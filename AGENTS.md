# zoho-flue

Exploratory repo for building LLM agents on [Flue](https://flueframework.com/) backed by Zoho Catalyst QuickML GLM.

## Directory map

| Path | Purpose |
|---|---|
| `src/agents/` | Agent entry points — one file per agent name |
| `src/config.ts` | All env reads and static constants |
| `src/tools/` | Application-controlled tool definitions |
| `src/providers/` | LLM and auth provider registrations |
| `src/mcp/` | Programmatic MCP server clients |
| `src/channels/` | Flue channel bindings |
| `src/sandboxes/` | Sandbox provider configurations |
| `src/workflows/` | Multi-step workflow definitions |

## Code conventions

- Never read `process.env` outside `src/config.ts`. Use `config.*` everywhere else.
- No `!` non-null assertions on env variables — `required()` throws at startup if absent.
- Unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (live credentials); optional browser component tests as `*.browser.test.tsx` (`pnpm test:browser`).
- Use Zod for schema validation; Valibot only where `defineTool` requires it.
- Tools hold credentials in closures — the model only sees parameter names, never raw tokens.

## Skills

Agent workflows live in `.agents/skills/`. Activate the relevant skill before starting work. See [docs/skills.md](docs/skills.md) for the agentskills.io spec compliance rules and four-tier context loading conventions.
