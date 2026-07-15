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
| `src/auth/` | OAuth / credential helpers (Zoho service-account token, per-user login, sessions, crypto) | below |
| `src/store/` | Persistence — Catalyst-agnostic repository interfaces + Catalyst NoSQL/Cache/Data Store / in-memory implementations, plus Flue's `PersistenceAdapter` | [auth.md](auth.md), [flue-persistence.md](flue-persistence.md) |
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

There is one agent, `assistant` (`src/agents/assistant.ts`). Its behavior — tools (`zoho_api`, `zoho_skill_get`, the a2ui tools, and the KB tools when `ZOHO_DOCS_BEARER_TOKEN` is set) and instructions — is single-sourced in a `defineAgentProfile`. Its instructions also teach it to run a Zoho CRM or Desk implementation conversationally: look up the exact endpoint via `zoho_skill_get` before calling `zoho_api`, resolve Desk's `orgId` once per conversation, and get explicit user confirmation before any mutating call. `zoho_api` itself runs as the signed-in user (their own token, their own granted scopes) rather than a shared credential — see [auth.md](auth.md#connecting-products-settings--and-why-the-zoho_api-tool-depends-on-it) for the connection/scope gate and the chat's Connect/Reconnect card.

**HITL confirmation can be bypassed per turn via "Auto mode"** (a Settings toggle, off by default). The chat sends it as an `x-hitl-auto-approve` header on every request — a live setting, not tied to any one conversation — resolved by `route` (`resolveHitlAutoApprove`) and recorded, along with the user id and `requestId`, in a per-conversation `TurnContext` map (`src/auth/request-context.ts`) rather than `AsyncLocalStorage` — a real bug surfaced this: `defineAgent`'s initializer can be invoked from a stale async continuation of an earlier, already-completed request, which under ALS read that earlier request's values instead of the current turn's. `defineAgent` reads the turn context back out (`currentTurnContext`) and swaps in the matching confirmation-policy paragraph for that turn's instructions (`confirmationPolicyInstructions`).

**Unless Auto mode is on, mutating `zoho_api` calls are gated in code, not just by instructions** (`src/tools/mutation-gate.ts`). The model must first call `propose_mutation` (`src/tools/propose-mutation.ts`) with a summary of the action; it returns a `mutationId` that is only valid in a **later** turn — `zoho_api` rejects it (and rejects any mutating call with no/invalid `mutationId`) if reused within the same request. Both tools are rebuilt fresh per turn in `defineAgent`, bound to that turn's `{conversationId, requestId, autoApprove}` (`requestId` is minted once per HTTP request in `route`), so a model cannot propose-and-execute a mutation within one turn no matter what it decides to do — a real new user message (the next turn) must arrive first.

The **provider-model is a per-conversation choice, not a separate agent per model.** The chat carries the chosen model as a `<key>__<uuid>` prefix on the conversation instance id; the agent initializer maps that key to a model spec from `config.chatModels`, defaulting to `defaultChatModelKey` (`anthropic/claude-sonnet-5`). Switching model starts a fresh conversation, so a thread never mixes models.

Built-in providers (e.g. `anthropic`) need no `registerProvider` call — only their credential in the environment. All providers are set up in `src/providers/` (via `registerProviders()`, invoked from `app.ts`), never in agent modules. The selectable models are served to the chat at `GET /api/models`.

## Configuration (`src/config.ts`)

All env reads and static constants live here — nowhere else reads `process.env`. A `required()` helper throws on startup if any required variable is absent.

| Key | Description |
|---|---|
| `zohoClientId/Secret/RefreshToken` | OAuth credentials |
| `catalystEndpoint/OrgId` | Catalyst GLM endpoint |
| `chatModels` | Selectable provider-models `{ key, label, spec, requiresAuth, attachmentMimeTypes }` (served at `/api/models`) |
| `defaultChatModelKey` | Default model key (`claude` → `anthropic/claude-sonnet-5`) |
| `anthropicApiKey` | Key for the built-in `anthropic` provider (required for the default model) |
| `catalystContextWindow` | Input context window (tokens) — drives Flue's compaction |
| `catalystMaxTokens` | Max output tokens per turn (default 2048 truncates chart-bearing replies) |
| `zohoDocsBearerToken` | Optional — enables KB MCP tools |
| `apiSecret` / `corsOrigins` | Optional — `/api/*` auth secret and allowed CORS origins |
| `zohoAllowedHostnames` | Domains `zoho_api` may reach |
| `zohoApiMaxRedirects` | Max redirect hops for `zoho_api` |
| `zohoApiMaxResponseChars` | Max characters of a `zoho_api` response body returned to the model — a single unbounded response (e.g. a bulk records list with no `fields`/`per_page` narrowing) can be large enough to blow the model's context budget in one tool call, before Flue's automatic compaction (which reacts between turns) gets a chance to react; oversized responses are truncated with a note instead |
| `zohoProducts` | Per-product (`crm`/`desk`) scope bundles the connection gate and Settings' "Connections" panel use |

When adding a setting: update `src/config.ts`, `.env`, and [`docs/environment.md`](environment.md).

## Tools (`src/tools/`)

Tools hold credentials in closures — the model only sees parameter names and descriptions, never raw tokens.

- `zoho-api.ts` — `defineZohoApiTool(deps, gate)`: runs as the signed-in user (`deps.getUserToken`), refreshing their access token per call. Accepts `{method, url, body, headers, mutationId}`; before touching a known product (CRM/Desk) verifies the user's own granted scopes cover that product's full bundle (`requireZohoConnection`, throwing a `ConnectionRequiredPayload` if not — see [auth.md](auth.md#connecting-products-settings--and-why-the-zoho_api-tool-depends-on-it)), rejects mutating methods without a valid `mutationId` (unless `gate.autoApprove`, see `mutation-gate.ts`), validates the URL against the allowed-hostname list, injects `Authorization` (and `Content-Type` when `body` is set), merges any caller-supplied `headers` (e.g. Zoho Desk's `orgId`) without letting them override those two, returns `{status, body}` with `body` truncated at `config.zohoApiMaxResponseChars` if the real response was larger. Follows redirects manually so each hop is re-validated.
- `check-zoho-connection.ts` / `zoho-connection.ts` / `connection-required.ts` — `check_zoho_connection` is a cheap, instant tool the model calls before `zoho_skill_get`/`zoho_api` to discover a missing/outdated connection in one step instead of after a doomed API attempt; both it and `zoho_api` share the same `requireZohoConnection` check (not a separate, weaker one), so the gate holds regardless of whether the model remembers to check first. A thrown `ConnectionRequiredPayload` (`__connection_required__:`-prefixed JSON in the error message) survives to the chat via `errorText` on the failing tool step; the client renders a Connect/Reconnect badge that re-verifies on tab focus (not just mount), since the OAuth round trip is a real cross-origin navigation whose exact reload timing relative to the badge's mount isn't something to rely on.
- `mutation-gate.ts` / `propose-mutation.ts` — the deterministic HITL confirmation gate: `propose_mutation` registers a proposed action and returns a `mutationId` valid only from a later turn; `zoho-api.ts` enforces it. See the Agents section above.
- `zoho-skills.ts` — `zohoSkillTools` / `defineZohoSkillTool()`: the `zoho_skill_get` tool, reading from the runtime skill catalog under `src/skills/` (distinct from `.agents/skills/`, which holds this repo's own Claude Code dev-workflow skills, not served to the deployed agent). Currently serves the vendored Zoho CRM/Desk implementation skill docs (`src/skills/zoho-{crm,desk}-*`) to the running agent on demand — a skill's `SKILL.md` body, or one of its `references/*.md` detail files — via an allowlist of skill names (`ALLOWED_SKILLS`), so the operation catalog stays out of the always-loaded system prompt (same on-demand-retrieval shape as the KB tools below).
- `request-input.ts` — `request_input`: a static tool (no per-turn gate needed, unlike `propose_mutation` — nothing depends on it having happened) the model calls to ask the user for missing information as a fillable form instead of prose. See [a2ui.md](a2ui.md#request_input--interactive-forms-not-a-display-only-a2ui-tool).
- `a2ui.ts` — presentational tools whose input is a visualization spec the model authors. Part of the a2ui feature — see [a2ui.md](a2ui.md).

## Auth (`src/auth/`)

Credential/OAuth helpers — distinct from `src/providers/` (which is only Flue model providers).

- `zoho-auth.ts` — the **service-account** token cache: exchanges a refresh token for a live Zoho access token (cached, refreshed 5 min before expiry, concurrent-refresh dedup). Consumed by the Catalyst GLM provider, the Catalyst NoSQL/Data Store/Stratus clients, and — keyed per user — by `getUserToken`.
- `zoho-oauth.ts` — the **per-user** authorization-code flow (PKCE + `state`): build the authorize URL, exchange the code for tokens, refresh a user's token.
- `routes.ts` — Hono sub-app for `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `session.ts` — `optionalUser` / `requireUser` middleware (signed cookie → session → user), `getUserToken(userId)`, and scope helpers.
- `crypto.ts` — AES-256-GCM encrypt/decrypt for refresh tokens at rest (keyId-tagged envelope, multi-key for rotation).

See [auth.md](auth.md) for the login flow, session model, scope management, and storage schema.

## Store (`src/store/`)

Persistence behind Catalyst-agnostic **repository interfaces** (`types.ts`): `UserStore`, `TokenStore`, `SessionStore`, `PreferenceStore`, `McpServerStore`, `SecretsStore`, `ConversationOwnerStore`, composed as `Stores`. Two implementations — `store/catalyst/` and `store/memory/` (in-memory, for unit tests and local dev before tables exist). `getStores()` selects the backend by `config.storeBackend`. The app depends only on the interfaces, so the backend is swappable.

The Catalyst backend right-sizes each store to the service that fits its access pattern: the four durable key-value / partition-based stores run on **NoSQL** (via a `nosql-client.ts` REST client mirroring the GLM provider's token pattern), `sessions` run on **Cache** (short-lived, per-request, auto-expiring, ≤2h), and `secrets`/`conversationOwners` run on **Data Store** for atomic first-writer-wins. All share one service-account admin token. Full schema and rationale: [auth.md](auth.md).

`conversationOwners` is what makes conversation ids private to their creator (`src/agents/assistant.ts`'s `route` handler `403`s any other user) — Flue's own conversation ids/persistence have no user concept at all, so this check has to live in application code.

Separately, `src/store/catalyst/flue/` implements Flue's own `PersistenceAdapter` (conversation/run/event/submission streams on NoSQL, attachments on Stratus), default-exported from `src/db.ts` so Flue wires durable engine state into the Node server — see [flue-persistence.md](flue-persistence.md).

`SecretsStore` backs `src/auth/secrets-bootstrap.ts`'s `initPersistedSecrets()`, which `app.ts` awaits at startup (before `getAuth()`) to resolve `config.sessionSecret` / `config.dataEncryptionKey`. These are generated once on first boot and reused thereafter — durable with the Catalyst backend, ephemeral-per-process with the memory backend (same as local dev today).

## Chat UI (`src/chat/`)

A Vite + React app (Kumo components) that renders live agent conversations through `@flue/react`'s `useFlueAgent`. `FlueRuntime.tsx` adapts Flue's durable event stream into view state; `Thread.tsx` renders messages, tool activity, and a2ui surfaces. Served in dev with `pnpm chat` (proxies `/api` and `/agents` to the agent server on `:3583`).

**Image attachments** ride Flue's direct-prompt `images` field (`AgentPromptImage[]`, base64 + MIME type — the only attachment channel the SDK exposes; there's no generic multi-file upload). `config.chatModels[].attachmentMimeTypes` gates the composer's attachment button per selected model (empty disables it with an explanatory popover — Catalyst GLM is assumed to support none); `/api/models` serves this alongside `label`/`requiresAuth`. `ConversationsStore.send()` (`conversations.tsx`) forwards `images` to `client.agents.send()` and echoes them optimistically as `file` message parts (a `data:` URL preview) so an attached image renders immediately, before the durable copy arrives. Historical attachment bytes are **not** re-servable after a reload without an opt-in `attachments` middleware export this app doesn't currently wire up, so a `file` part with no resolvable `url` (post-reload) renders as a "not available" placeholder instead of a broken image.

In production, `pnpm chat:build` outputs static assets to `src/chat/dist`, and `app.ts` serves them same-origin (static files + SPA fallback to `index.html`) ahead of the `flue()` mount — see [Deploying to Catalyst](deploy-catalyst.md).

## Code Conventions

- No `process.env` reads outside `src/config.ts`.
- No `!` non-null assertions on env variables.
- Tests: unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (live credentials, `pnpm test:smoke`); optional React component tests as `*.browser.test.tsx` (`pnpm test:browser`).
