# Architecture

Built on [Flue](https://flueframework.com/), a Node.js agent framework. Source lives under `src/`; entry point for Flue configuration is `flue.config.ts`.

## Components

| Path | Purpose | Detail |
|---|---|---|
| `src/app.ts` | Application entry — registers providers, mounts `flue()`, defines HTTP/API routes, CORS, and auth middleware | below |
| `src/agents/` | Agent entry points — one file per agent name | below |
| `src/config.ts` | Single source of truth for all settings | below |
| `src/tools/` | Application-controlled tool definitions | below |
| `src/providers/` | LLM and auth provider registrations | [providers.md](providers.md) |
| `src/mcp/` | Programmatic MCP server clients | [mcp-clients.md](mcp-clients.md) |

## Application entry (`src/app.ts`)

The Hono app Flue mounts. It runs once at startup and is loaded in every run mode (`flue dev`, `flue run`, build), so it is the right place for runtime setup:

- Registers the Catalyst GLM provider via `registerCatalystGLM(...)`, fetching a Zoho access token at startup and passing `contextWindow` so Flue's built-in compaction works. **Providers are registered here, not in agent modules.**
- Defines the `/api/*` routes (agents list, skills, runs, user profile/photo proxy), CORS, and the optional `FLUE_API_SECRET` gate.
- Mounts the Flue agent/stream routes with `app.route('/', flue())`.

## Agents (`src/agents/`)

Each file default-exports a `defineAgent(...)`. The filename is the agent name passed to `flue run`. Export `route` to expose the agent over HTTP at `POST /agents/<name>/:id`.

`main` is the primary agent. It declares the model (`config.model`), its tools (`zoho_api`, plus the KB tools when `ZOHO_DOCS_BEARER_TOKEN` is set), and its instructions. It does **not** register providers — that happens in `src/app.ts`.

## Configuration (`src/config.ts`)

All env reads and static constants live here — nowhere else reads `process.env`. A `required()` helper throws on startup if any required variable is absent.

| Key | Description |
|---|---|
| `zohoClientId/Secret/RefreshToken` | OAuth credentials |
| `catalystEndpoint/OrgId` | Catalyst GLM endpoint |
| `model` | Model ID string (`catalyst-glm/...`) |
| `catalystContextWindow` | Input context window (tokens) — drives Flue's compaction |
| `zohoDocsBearerToken` | Optional — enables KB MCP tools |
| `apiSecret` / `corsOrigins` | Optional — `/api/*` auth secret and allowed CORS origins |
| `zohoAllowedHostnames` | Domains `zoho_api` may reach |
| `zohoApiMaxRedirects` | Max redirect hops for `zoho_api` |

When adding a setting: update `src/config.ts`, `.env`, and [`docs/environment.md`](environment.md).

## Tools (`src/tools/`)

Tools hold credentials in closures — the model only sees parameter names and descriptions, never raw tokens.

- `zoho-api.ts` — `defineZohoApiTool(oauth)`: holds OAuth credentials in a closure and refreshes the access token per call. Accepts `{method, url, body}`, validates the URL against the allowed-hostname list, injects `Authorization`, returns `{status, body}`. Follows redirects manually so each hop is re-validated.

## Code Conventions

- No `process.env` reads outside `src/config.ts`.
- No `!` non-null assertions on env variables.
- Tests: unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (live credentials, `pnpm test:smoke`); optional React component tests as `*.browser.test.tsx` (`pnpm test:browser`).
