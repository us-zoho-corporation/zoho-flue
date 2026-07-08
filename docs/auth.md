# User login, tokens & Catalyst-backed storage

Per-user Zoho OAuth login plus a Catalyst-backed store for user identity, OAuth
tokens, granted API scopes, and preferences. Distinct from the **service account**
(`src/auth/zoho-auth.ts`), which still powers the GLM provider and the Data Store
admin token.

## Layers

- **`src/store/`** — Catalyst-agnostic repository interfaces (`types.ts`): `UserStore`,
  `TokenStore`, `SessionStore`, `PreferenceStore`, `McpServerStore`, `SecretsStore`, composed
  as `Stores`. Two backends: `store/catalyst/` (the four durable user stores on **NoSQL**,
  `sessions` on **Cache**, `secrets` on **Data Store**, all over REST with the admin service
  token) and `store/memory/` (in-memory, for tests/local dev). `getStores()` picks one via
  `STORE_BACKEND`. Each store runs on the service best fit to its access pattern — see the
  schema below.
- **`src/auth/zoho-oauth.ts`** — the authorization-code flow (PKCE + `state`): build
  the consent URL, exchange the code, fetch the user profile.
- **`src/auth/session.ts`** — signed-cookie sessions, `optionalUser`/`requireUser`
  middleware, `getUserToken(userId)`, `hasScope`.
- **`src/auth/routes.ts`** — the `/api/auth` sub-app + `createAuth()` bundler.
- **`src/auth/crypto.ts`** — AES-256-GCM for refresh tokens at rest.

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
(identity) and `QuickML.deployment.READ` (so the user's token can reach the Zoho GLM 4.7
Flash endpoint).

## Per-user tokens

`getUserToken(userId)` decrypts the stored refresh token and calls the shared
`getZohoAccessToken` cache (keyed by refresh-token hash) — so per-user access tokens get
independent caching, concurrent-refresh dedup, and 5-min skew handling for free. If a user
has no stored token, callers get `reauth_required` (401).

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
- **Data Store** for `secrets` — its read-ordered insert gives `createIfAbsent`
  clean atomic first-writer-wins.

We write our own epoch-ms attributes; all access is admin-scoped via the service
token. Create these in the console (NoSQL tables/indexes and Cache segments are
Console-only) before setting `STORE_BACKEND=catalyst`. Partition/sort keys are
**String** unless noted.

NoSQL tables:

- **Users** — partition `UserId`. Attributes: `Email`, `DisplayName`, `FirstName`, `LastName`, `PhotoId`, `CreatedAt`, `LastLoginAt`.
- **UserTokens** — partition `UserId`. Attributes: `RefreshTokenEnc`, `Scopes`(list), `AccountsServer`, `UpdatedAt`.
- **Preferences** — partition `UserId`. Attributes: `PreferredModelKey`, `Data`(map), `UpdatedAt`.
- **McpServers** — partition `UserId`, sort `Id`. Attributes: `Name`, `Url`, `Transport`, `AuthTokenEnc`, `Enabled`(boolean), `CreatedAt`, `UpdatedAt`.

Cache segment (sessions):

- One segment (numeric id via `CATALYST_CACHE_SEGMENT`, or the project's default). The store writes a `sess:{sessionId}` value per session (TTL = the session's remaining lifetime) plus a `usess:{userId}` index set (pinned to Cache's 48h max) that `deleteAllForUser` reads to revoke every session for a user. The index is maintained with read-modify-write; under Flue's single-owner deployment a concurrent lost update could at worst drop an id from logout-everywhere, never corrupt a session — an accepted tradeoff for putting the hot-path session read in Cache.

Data Store table:

- **AppSecrets**: `Key`(unique) · `Value` · `UpdatedAt`(BigInt) — durable app secrets (session-cookie signing key, refresh-token encryption keyring), generated once on first boot by `src/auth/secrets-bootstrap.ts`. Never exposed via any API route.

(Flue's own engine state uses a further set of NoSQL tables + a Stratus bucket — see [flue-persistence.md](flue-persistence.md).)

## Setup checklist

1. Register `ZOHO_OAUTH_REDIRECT_URI` as an Authorized Redirect URI on the Zoho OAuth client.
2. Ensure the **service-account** refresh token carries `ZohoCatalyst.nosql.item.{CREATE,READ,UPDATE}` (NoSQL stores), `ZohoCatalyst.cache.{CREATE,READ,DELETE}` (Cache sessions), and `ZohoCatalyst.tables.rows.{CREATE,READ,UPDATE,DELETE}` + `ZohoCatalyst.zcql.CREATE` (the `AppSecrets` Data Store table).
3. Create the NoSQL tables above and the `AppSecrets` Data Store table, and note the Cache segment id (the default segment works). Set `STORE_BACKEND=catalyst` and `CATALYST_CACHE_SEGMENT` to that segment id.
4. Nothing else to configure: the signed-cookie secret and the refresh-token encryption key are bootstrapped automatically into `AppSecrets` on first boot.

Config keys: [environment.md](environment.md). Smoke test: `tests/smoke/` (live Development).
