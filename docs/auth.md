# User login, tokens & Catalyst-backed storage

Per-user Zoho OAuth login plus a Catalyst-backed store for user identity, OAuth
tokens, granted API scopes, and preferences. Distinct from the **service account**
(`src/auth/zoho-auth.ts`), which powers the Catalyst NoSQL/Data Store/Stratus
admin token.

## Layers

- **`src/store/`** — Catalyst-agnostic repository interfaces (`types.ts`): `UserStore`,
  `TokenStore`, `DocsTokenStore`, `SessionStore`, `PreferenceStore`, `McpServerStore`,
  `SecretsStore`, composed as `Stores`. Two backends: `store/catalyst/` (the durable user
  stores on **NoSQL**, `sessions` on **Cache**, `secrets` on **Data Store**, all over REST
  with the admin service token) and `store/memory/` (in-memory, for tests/local dev).
  `getStores()` picks one via `STORE_BACKEND`. Each store runs on the service best fit to
  its access pattern — see the schema below.
- **`src/auth/zoho-oauth.ts`** — the authorization-code flow (PKCE + `state`): build
  the consent URL, exchange the code, fetch the user profile.
- **`src/auth/session.ts`** — signed-cookie sessions, `optionalUser`/`requireUser`
  middleware, `getUserToken(userId)`, `hasScope`.
- **`src/auth/routes.ts`** — the `/api/auth` sub-app + `createAuth()` bundler.
- **`src/auth/crypto.ts`** — AES-256-GCM for refresh tokens at rest.
- **`src/auth/docs-oauth.ts`** — a second, self-contained OAuth 2.1 + PKCE client for
  the docs knowledge-base MCP server's own authorization server (see "Docs
  knowledge-base connection" below) — not a Zoho product, so it doesn't use any of
  the layers above.

## Login flow

1. `GET /api/auth/login[?returnTo=/&scopes=...]` — mints a PKCE pair + `state`, stores
   `{state, verifier, returnTo}` in a 10-min signed `flue_login` cookie, and 302s to Zoho
   consent. `scopes` is unioned with the minimal `ZOHO_LOGIN_SCOPES`.
2. `GET /api/auth/callback` — verifies `state` (constant-time) against the `flue_login`
   cookie, exchanges the code (with the PKCE verifier), fetches the profile, then upserts
   the `User`, stores the **encrypted** refresh token + **merged granted scopes**, and opens
   a session (`flue_sid` signed httpOnly cookie). 302s to the validated relative `returnTo`.
3. `POST /api/auth/logout` — deletes the session row + cookie.
4. `GET /api/auth/me` — `{ authenticated, user, scopes }` from the session (no Zoho call).

`GET /api/me` and `/api/photo` require a session; `/api/me` reads the stored profile,
`/api/photo` fetches the user's own photo with their token (needs a contacts scope).

## Sessions

Opaque 256-bit id in a signed `flue_sid` cookie; the server-side session is authoritative
(logout/expiry are server-enforced). Sliding expiry re-issues at most every 5 minutes, so
`SESSION_TTL_SECONDS` (default **2 hours**) is an idle timeout — each touch re-extends it.
The short, per-request, auto-expiring nature is why sessions live in **Cache** rather than a
durable store. When `FLUE_API_SECRET` is set, the
`/api/*` gate accepts **either** a valid session **or** the secret; `/api/auth/*` is always
public so users can log in.

## API scopes

Granted scopes are stored on `UserTokens.Scopes` and merged (union) on every login, so
`GET /api/auth/login?scopes=<extra>` performs **incremental authorization** (comma- or
space-separated; sent to Zoho comma-delimited). Gate scope-dependent features with
`hasScope(deps, userId, scope)`. Default login scopes are `AaaServer.profile.READ`
(identity) and `ZohoCRM.org.READ` (so `GET /api/org` can show the user's Zoho CRM
organization name in the profile popup right after login, with no separate CRM connection needed).

## Connecting products (Settings) — and why the `zoho_api` tool depends on it

`config.zohoProducts` is the catalog of Zoho products (CRM, Desk) the chat's Settings
panel offers as one-click connections, each with its full scope bundle (kept in sync with
the `## Scopes` sections of `src/skills/zoho-crm-*`/`zoho-desk-*`). `GET
/api/auth/connections` reports, per product, whether the signed-in user's stored grant
already covers that bundle. The Settings UI's "Connect" button sends the user through
`GET /api/auth/login?scopes=<product scopes>&returnTo=/?view=settings` — the existing
incremental-auth path, with `returnTo` pointed back at the Settings view (the chat's
`resolveInitialView()` in `App.tsx` reads `?view=` on load and strips it). `POST
/api/auth/connections/:key/disconnect` drops a product's scope bundle from the stored
grant (locally only — it doesn't call Zoho's revoke endpoint, so re-connecting doesn't
need a fresh consent screen).

The `zoho_api` tool (`src/tools/zoho-api.ts`) used by the `assistant` agent for CRM/Desk
calls runs as the **signed-in user**, not the service account — it identifies the target
product from the URL's hostname, checks the user's own granted scopes against that
product's bundle (excluding scopes shared with the default login grant, e.g.
`ZohoCRM.org.READ`, from counting as evidence of a deliberate prior connection), and gets
its bearer token via `getUserToken`. If the bundle isn't fully granted, it throws a
`ConnectionRequiredPayload` (`src/tools/connection-required.ts`) instead of running —
`mode: 'connect'` if the user has none of the product's own scopes yet, `'reconnect'` if
some are missing. The chat parses this off the tool step's `errorText` (Flue already
carries a thrown error's message through as `errorText` on an `output-error` part —
previously discarded by `src/chat/src/flue-model.ts`'s view model, now passed through)
and renders a Connect/Reconnect card whose button re-runs the exact same
`/api/auth/login?scopes=...` flow as the Settings panel, returning to the chat instead of
Settings. MCP tool calls use the same structured error for a different trigger: a call to
an already-discovered tool that fails at runtime (expired auth, server down) throws
`{ kind: 'mcp', mode: 'reconnect' }` instead of returning the failure as fake-successful
text, and the chat's button for that opens the MCP servers view (there's no one-click fix
for an MCP server — the user may need a new URL or token). A server that's disabled or
fails **discovery** (at turn start) simply contributes no tools at all — the model never
attempts to call one, so there's no tool-call error to react to for that case.

## Docs knowledge-base connection

The docs knowledge-base MCP server (`help-docs.zoho-forge.com`, used by
`src/mcp/zoho-kb.ts`) is **not a Zoho product** — it runs its own OAuth 2.1
authorization server (PKCE required, discoverable at
`/.well-known/oauth-authorization-server`), entirely separate from
`accounts.zoho.com`. `DOCS_OAUTH_CLIENT_ID`/`DOCS_OAUTH_CLIENT_SECRET` come
from a one-time dynamic client registration (RFC 7591) against that server's
`/register` endpoint. It's kept self-contained in `src/auth/docs-oauth.ts`
(own PKCE/state, own `DocsTokenStore` row, own access-token cache/refresh)
rather than folded into the Zoho-shaped modules above.

It still rides the same generic Connections list and UI as the Zoho
products, just as one more entry: `GET /api/auth/connections` appends a
`{ key: 'docs', kind: 'docs', scopes: [], connected }` row whenever
`DOCS_OAUTH_CLIENT_ID` is set (`connected` is just "has a stored token" — a
single fixed scope grant, no per-tool scope diffing). `GET
/api/auth/docs/connect` (requires an existing session) and `GET
/api/auth/docs/callback` mirror the PKCE + signed-cookie shape of
`/api/auth/login`/`/callback`, but against the docs server's own
authorize/token endpoints. `POST /api/auth/connections/:key/disconnect`
with `key: 'docs'` just drops the stored token outright (no scope bundle to
diff). `src/mcp/zoho-kb.ts`'s tools throw the same
`ConnectionRequiredPayload` (`kind: 'docs'`) as `zoho_api` does for Zoho
products when the calling user has no token or a dead refresh token, opening
a short-lived per-call MCP client with that user's own access token — there
is no shared, process-wide client, since the token is per user.

## Per-user tokens

`getUserToken(userId)` decrypts the stored refresh token and calls the shared
`getZohoAccessToken` cache (keyed by refresh-token hash) — so per-user access tokens get
independent caching, concurrent-refresh dedup, and 5-min skew handling for free. If a user
has no stored token, callers get `reauth_required` (401).

Each user's `accountsServer` (captured at login/consent, e.g. `https://accounts.zoho.eu`)
is passed through as `accountsBase` on every refresh — a refresh token is only valid
against the data center it was issued from, so this must be preserved and reused, not
assumed to be the US default. `zohoDomainFor(accountsServer, subdomain)` (`zoho-oauth.ts`)
derives any other product domain (`www.zohoapis`, `contacts.zoho`, `desk.zoho`) for that
same data center — used by `/api/org` and `/api/photo` in `app.ts`.

## Token encryption

Refresh tokens are AES-256-GCM encrypted; the envelope is `v1:<keyId>:<iv>:<tag>:<ct>`.
The keyring (`keyId -> 32-byte key`, parsed by `src/auth/crypto.ts`) is loaded via
`src/auth/secrets-bootstrap.ts` from the `AppSecrets` table — generated once on first
boot, reused by every later boot. The active key encrypts new writes and any key in the
ring can decrypt. It survives AppSail redeploys and restarts, so previously-encrypted
refresh tokens stay decryptable.

## Storage schema (case-sensitive)

Each store runs on the Catalyst service that fits its access pattern:

- **NoSQL** for the four durable key-value / partition-based stores.
- **Cache** for `sessions` — short-lived, read on every request, and auto-expiring.
- **Data Store** for `secrets` and `conversationOwners` — their read-ordered insert
  gives `createIfAbsent`/`claimOrGetOwner` clean atomic first-writer-wins.

We write our own epoch-ms attributes; all access is admin-scoped via the service
token. Create these in the console (NoSQL tables/indexes and Cache segments are
Console-only) before setting `STORE_BACKEND=catalyst`. Partition/sort keys are
**String** unless noted.

NoSQL tables:

- **Users** — partition `UserId`. Attributes: `Email`, `DisplayName`, `FirstName`, `LastName`, `PhotoId`, `CreatedAt`, `LastLoginAt`.
- **UserTokens** — partition `UserId`. Attributes: `RefreshTokenEnc`, `Scopes`(list), `AccountsServer`, `UpdatedAt`.
- **DocsTokens** — partition `UserId`. Attributes: `RefreshTokenEnc`, `UpdatedAt`. The docs knowledge-base connection's own token row (see "Docs knowledge-base connection" above) — no `Scopes`/`AccountsServer`, since it's a single fixed grant against a non-Zoho authorization server.
- **Preferences** — partition `UserId`. Attributes: `PreferredModelKey`, `Data`(map), `UpdatedAt`.
- **McpServers** — partition `UserId`, sort `Id`. Attributes: `Name`, `Url`, `Transport`, `AuthTokenEnc`, `Enabled`(boolean), `CreatedAt`, `UpdatedAt`.

Cache segment (sessions):

- One segment (numeric id via `CATALYST_CACHE_SEGMENT`, or the project's default). The store writes a `sess:{sessionId}` value per session (TTL = the session's remaining lifetime) plus a `usess:{userId}` index set (pinned to Cache's 48h max) that `deleteAllForUser` reads to revoke every session for a user. The index is maintained with read-modify-write; under Flue's single-owner deployment a concurrent lost update could at worst drop an id from logout-everywhere, never corrupt a session — an accepted tradeoff for putting the hot-path session read in Cache.

Data Store tables:

- **AppSecrets**: `Key`(unique) · `Value` · `UpdatedAt`(BigInt) — durable app secrets (session-cookie signing key, refresh-token encryption keyring), generated once on first boot by `src/auth/secrets-bootstrap.ts`. Never exposed via any API route.
- **ConversationOwners**: `ConversationId`(unique) · `UserId` · `CreatedAt`(BigInt) — records which user first claimed a conversation id (`src/store/catalyst/conversation-owner-repo.ts`). Enforced in `src/agents/assistant.ts`'s `route` handler: any other user requesting that id gets `403`. Without this, conversation ids are client-generated with no owner concept anywhere in Flue's own persistence, so any authenticated user who obtained another user's id (a leaked/shared session, or a guess) could read their full message history.

(Flue's own engine state uses a further set of NoSQL tables + a Stratus bucket — see [flue-persistence.md](flue-persistence.md).)

## Setup checklist

1. Register `ZOHO_OAUTH_REDIRECT_URI` as an Authorized Redirect URI on the Zoho OAuth client.
2. Ensure the **service-account** refresh token carries `ZohoCatalyst.nosql.item.{CREATE,READ,UPDATE}` (NoSQL stores), `ZohoCatalyst.cache.{CREATE,READ,DELETE}` (Cache sessions), and `ZohoCatalyst.tables.rows.{CREATE,READ,UPDATE,DELETE}` + `ZohoCatalyst.zcql.CREATE` (the `AppSecrets`/`ConversationOwners` Data Store tables).
3. Create the NoSQL tables above (including `DocsTokens`, only needed if the docs knowledge-base connection is enabled) and the `AppSecrets`/`ConversationOwners` Data Store tables, and note the Cache segment id (the default segment works). Set `STORE_BACKEND=catalyst` and `CATALYST_CACHE_SEGMENT` to that segment id.
4. Nothing else to configure: the signed-cookie secret and the refresh-token encryption key are bootstrapped automatically into `AppSecrets` on first boot.

Config keys: [environment.md](environment.md). Smoke test: `tests/smoke/` (live Development).
