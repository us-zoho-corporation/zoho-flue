# Architecture

Built on [Flue](https://flueframework.com/), a Node.js agent framework. Source lives under `src/`; entry point for Flue configuration is `flue.config.ts`.

## Components

| Path | Purpose | Detail |
|---|---|---|
| `src/agents/` | Agent entry points — one file per agent name | below |
| `src/config.ts` | Single source of truth for all settings | below |
| `src/tools/` | Application-controlled tool definitions | below |
| `src/providers/` | LLM and auth provider registrations | [providers.md](providers.md) |
| `src/mcp/` | Programmatic MCP server clients | [mcp-clients.md](mcp-clients.md) |

## Agents (`src/agents/`)

Each file default-exports a `defineAgent(...)`. The filename is the agent name passed to `flue run`.

`main` is the primary agent. It registers Catalyst GLM, fetches a Zoho access token, and optionally activates KB tools when `ZOHO_DOCS_TOKEN` is set.

## Configuration (`src/config.ts`)

All env reads and static constants live here — nowhere else reads `process.env`. A `required()` helper throws on startup if any required variable is absent.

| Key | Description |
|---|---|
| `zohoClientId/Secret/RefreshToken` | OAuth credentials |
| `catalystEndpoint/OrgId` | Catalyst GLM endpoint |
| `model` | Model ID string |
| `zohoDocsToken` | Optional — enables KB MCP tools |
| `zohoAllowedHostnames` | Domains `zoho_api` may reach |
| `zohoApiMaxRedirects` | Max redirect hops for `zoho_api` |

When adding a setting: update `src/config.ts`, `.env`, and [`docs/environment.md`](environment.md).

## Tools (`src/tools/`)

Tools hold credentials in closures — the model only sees parameter names and descriptions, never raw tokens.

- `zoho-api.ts` — `defineZohoApiTool(token)`: accepts `{method, url, body}`, validates the URL against the allowed-hostname list, injects `Authorization`, returns `{status, body}`. Follows redirects manually so each hop is re-validated.

## Code Conventions

- No `process.env` reads outside `src/config.ts`.
- No `!` non-null assertions on env variables.
- Tests: unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (require live credentials, run with `pnpm test:smoke`).
