# Architecture

Built on [Flue](https://flueframework.com/), a Node.js agent framework. Entry point for configuration is `flue.config.ts`. Source lives under `src/`.

## Agents (`src/agents/`)

Each file default-exports a `defineAgent(...)`. The filename is the agent name used with `flue run` (e.g. `src/agents/main.ts` → `flue run main`).

`main` is the single agent entry point. It uses the `zoho_api` tool for authenticated Zoho API access and Flue's in-memory virtual sandbox (just-bash) for data processing.

## Configuration (`src/config.ts`)

All settings live in `src/config.ts` — the single source of truth for both environment-derived values and static application constants. Variables are read once at startup via an internal `required()` helper that throws immediately with a clear message if any are absent.

```
config.zohoClientId / zohoClientSecret / zohoRefreshToken  — OAuth credentials
config.catalystEndpoint / catalystOrgId                    — Catalyst GLM endpoint
config.model                                               — model ID used by all agents
config.zohoAllowedHostnames                               — domains the zoho_api tool may reach
config.zohoApiMaxRedirects                                 — max redirect hops for zoho_api
```

Agents and tools import from `config` — no `process.env` reads elsewhere. When adding a new setting: add it to `src/config.ts`, add any new env key to `.env`, and document it in `docs/environment.md`.

## Code conventions

- All exported and non-trivial internal functions carry a one-line JSDoc describing non-obvious behaviour.
- No `process.env` reads outside `src/config.ts`.
- No `!` non-null assertions on environment variables.

## Sandbox

The `code` agent uses Flue's built-in **virtual sandbox** — an in-memory, just-bash workspace selected by omitting the `sandbox:` field in `defineAgent`. No external service or VM is required.

## Tools (`src/tools/`)

Application-controlled capabilities exposed to agents. Tools hold credentials in closures — the model only sees parameter names and descriptions, never raw tokens or secrets.

- `zoho-api.ts` — `defineZohoApiTool(token)` returns a `zoho_api` tool that accepts `{method, url, body}`, validates the URL is under an allowed Zoho domain (`zoho.com`, `zohoapis.com`, `zohocorp.com`), injects the `Authorization` header, and returns `{status, body}`. This is the correct pattern per Flue's guidelines: the application controls the credential boundary, the model controls only which endpoint to call.

If a future agent requires an isolated provider VM, add a sandbox adapter via `flue add sandbox <provider>` and place it in `src/sandboxes/`.

## Tests

Unit tests live colocated with source as `*.test.ts`. Smoke tests live in `tests/smoke/` and require live API credentials — run with `pnpm test:smoke`.

## Providers (`src/providers/`)

Custom integrations registered at agent startup:

- `catalyst-glm.ts` — Flue API provider wrapping Zoho Catalyst's QuickML GLM endpoint. Catalyst returns `{ response: string, usage: {...} }`, not OpenAI's `choices[]` format.
- `zoho-auth.ts` — exchanges `ZOHO_OAUTH_REFRESH_TOKEN` for a live Zoho access token via `POST https://accounts.zoho.com/oauth/v2/token`.

## Auth Pattern

Agents call `getZohoAccessToken(...)` at module load (top-level await), then pass the token into `registerCatalystGLM(...)`. The token is always fetched fresh on startup — no static bearer token.

## Model ID Format

`catalyst-glm/<model-id>` — e.g. `catalyst-glm/crm-di-glm47b_30b_it`
