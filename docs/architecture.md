# Architecture

Built on [Flue](https://flueframework.com/), a Node.js agent framework. Source lives under `src/`; entry point for Flue configuration is `flue.config.ts`.

## Components

| Path | Purpose | Detail |
|---|---|---|
| `src/app.ts` | Application entry — registers providers, mounts `flue()`, defines HTTP/API routes, CORS, and auth middleware | below |
| `src/agents/` | Agent entry points — one file per agent name | below |
| `src/config.ts` | Single source of truth for all settings | below |
| `src/tools/` | Application-controlled tool definitions | below |
| `src/providers/` | Model/LLM provider registrations only | [providers.md](providers.md) |
| `src/auth/` | OAuth / credential helpers (Zoho token exchange) | below |
| `src/mcp/` | Programmatic MCP server clients | [mcp-clients.md](mcp-clients.md) |
| `src/chat/` | Browser chat UI | below |
| **a2ui** | Generative UI streaming | [a2ui.md](a2ui.md) |

## Application entry (`src/app.ts`)

The Hono app Flue mounts. It runs once at startup and is loaded in every run mode (`flue dev`, `flue run`, build), so it is the right place for runtime setup:

- Calls `registerProviders()` (from `src/providers/`) at startup — it registers the Catalyst GLM (custom) and Anthropic (built-in) providers. **Provider setup lives in `src/providers/` and is wired in here, never in agent modules.**
- Defines the `/api/*` routes (agents list, selectable models, skills, runs, user profile/photo proxy), CORS, and the optional `FLUE_API_SECRET` gate.
- Mounts the Flue agent/stream routes with `app.route('/', flue())`.

## Agents (`src/agents/`)

Each file default-exports a `defineAgent(...)`. The filename is the agent name passed to `flue run`. Export `route` to expose the agent over HTTP at `POST /agents/<name>/:id`.

There is one agent, `assistant` (`src/agents/assistant.ts`). Its behavior — tools (`zoho_api`, the a2ui tools, and the KB tools when `ZOHO_DOCS_BEARER_TOKEN` is set) and instructions — is single-sourced in a `defineAgentProfile`.

The **provider-model is a per-conversation choice, not a separate agent per model.** The chat carries the chosen model as a `<key>__<uuid>` prefix on the conversation instance id; the agent initializer maps that key to a model spec from `config.chatModels`, defaulting to `defaultChatModelKey` (`anthropic/claude-sonnet-5`). Switching model starts a fresh conversation, so a thread never mixes models.

Built-in providers (e.g. `anthropic`) need no `registerProvider` call — only their credential in the environment. All providers are set up in `src/providers/` (via `registerProviders()`, invoked from `app.ts`), never in agent modules. The selectable models are served to the chat at `GET /api/models`.

## Configuration (`src/config.ts`)

All env reads and static constants live here — nowhere else reads `process.env`. A `required()` helper throws on startup if any required variable is absent.

| Key | Description |
|---|---|
| `zohoClientId/Secret/RefreshToken` | OAuth credentials |
| `catalystEndpoint/OrgId` | Catalyst GLM endpoint |
| `chatModels` | Selectable provider-models `{ key, label, spec }` (served at `/api/models`) |
| `defaultChatModelKey` | Default model key (`claude` → `anthropic/claude-sonnet-5`) |
| `anthropicApiKey` | Key for the built-in `anthropic` provider (required for the default model) |
| `catalystContextWindow` | Input context window (tokens) — drives Flue's compaction |
| `catalystMaxTokens` | Max output tokens per turn (default 2048 truncates chart-bearing replies) |
| `zohoDocsBearerToken` | Optional — enables KB MCP tools |
| `apiSecret` / `corsOrigins` | Optional — `/api/*` auth secret and allowed CORS origins |
| `zohoAllowedHostnames` | Domains `zoho_api` may reach |
| `zohoApiMaxRedirects` | Max redirect hops for `zoho_api` |

When adding a setting: update `src/config.ts`, `.env`, and [`docs/environment.md`](environment.md).

## Tools (`src/tools/`)

Tools hold credentials in closures — the model only sees parameter names and descriptions, never raw tokens.

- `zoho-api.ts` — `defineZohoApiTool(oauth)`: holds OAuth credentials in a closure and refreshes the access token per call. Accepts `{method, url, body}`, validates the URL against the allowed-hostname list, injects `Authorization`, returns `{status, body}`. Follows redirects manually so each hop is re-validated.
- `a2ui.ts` — presentational tools whose input is a visualization spec the model authors. Part of the a2ui feature — see [a2ui.md](a2ui.md).

## Auth (`src/auth/`)

Credential/OAuth helpers — distinct from `src/providers/` (which is only Flue model providers). `zoho-auth.ts` exchanges `ZOHO_OAUTH_REFRESH_TOKEN` for a live Zoho access token (cached, refreshed 5 min before expiry). Consumed by the Catalyst GLM provider (its bearer token) and the `/api/me` / `/api/photo` routes. See the `zoho-oauth` skill for the credential setup flow.

## Chat UI (`src/chat/`)

A Vite + React app (Kumo components) that renders live agent conversations through `@flue/react`'s `useFlueAgent`. `FlueRuntime.tsx` adapts Flue's durable event stream into view state; `Thread.tsx` renders messages, tool activity, and a2ui surfaces. Served in dev with `pnpm chat` (proxies `/api` and `/agents` to the agent server on `:3583`).

## Code Conventions

- No `process.env` reads outside `src/config.ts`.
- No `!` non-null assertions on env variables.
- Tests: unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (live credentials, `pnpm test:smoke`); optional React component tests as `*.browser.test.tsx` (`pnpm test:browser`).
