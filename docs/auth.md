# User login, tokens & Catalyst-backed storage

Per-user Zoho OAuth login plus a Catalyst-backed store for user identity, OAuth
tokens, granted API scopes, and preferences. Distinct from the **service account**
(`src/auth/zoho-auth.ts`), which still powers the GLM provider and the Data Store
admin token.

## Layers

- **`src/store/`** — Catalyst-agnostic repository interfaces (`types.ts`): `UserStore`,
  `TokenStore`, `SessionStore`, `PreferenceStore`, composed as `Stores`. Two backends:
  `store/catalyst/` (Data Store over REST, admin service token) and `store/memory/`
  (in-memory, for tests/local dev). `getStores()` picks one via `STORE_BACKEND`.
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

Opaque 256-bit id in a signed `flue_sid` cookie; the `Sessions` row is authoritative
(logout/expiry are server-enforced). Sliding expiry re-issues at most every 5 minutes.
`SESSION_TTL_SECONDS` sets lifetime (default 30 days). When `FLUE_API_SECRET` is set, the
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

## Token encryption & key rotation

Refresh tokens are AES-256-GCM encrypted; the envelope is `v1:<keyId>:<iv>:<tag>:<ct>`.
`DATA_ENCRYPTION_KEY` is a comma-separated list of `keyId:base64(32B)` — the **first** key
is active for new writes, **all** keys can decrypt. To rotate: prepend a new key (it becomes
active), keep the old key present so existing rows still decrypt; each user's token is
re-encrypted with the active key on their next login. Drop the old key once all users have
re-logged in.

## Data Store schema (case-sensitive)

Create these four tables in the Catalyst console (or via MCP) before setting
`STORE_BACKEND=catalyst`. We write our own epoch-ms columns and treat Catalyst's
`CREATEDTIME` as advisory (avoids the project-timezone offset trap). All access is
admin-scoped via the service token, so App User table permissions are not required.

- **Users**: `UserId`(unique) · `Email` · `DisplayName` · `FirstName` · `LastName` · `PhotoId` · `CreatedAt`(BigInt) · `LastLoginAt`(BigInt)
- **UserTokens**: `UserId`(unique) · `RefreshTokenEnc` · `Scopes` · `AccountsServer` · `UpdatedAt`(BigInt)
- **Sessions**: `SessionId`(unique) · `UserId` · `CreatedAt`(BigInt) · `ExpiresAt`(BigInt) · `LastSeenAt`(BigInt)
- **Preferences**: `UserId`(unique) · `PreferredModelKey` · `Data`(text/JSON) · `UpdatedAt`(BigInt)
- **McpServers**: `Id`(unique) · `UserId` · `Name` · `Url` · `Transport` · `AuthTokenEnc` · `Enabled`(boolean) · `CreatedAt`(BigInt) · `UpdatedAt`(BigInt)

## Setup checklist

1. Register `ZOHO_OAUTH_REDIRECT_URI` as an Authorized Redirect URI on the Zoho OAuth client.
2. Ensure the **service-account** refresh token carries `ZohoCatalyst.tables.rows.{CREATE,READ,UPDATE,DELETE}` + `ZohoCatalyst.zcql.CREATE` (for Data Store writes).
3. Create the four tables above; set `STORE_BACKEND=catalyst`.
4. Set `SESSION_SECRET` and `DATA_ENCRYPTION_KEY` (see [environment.md](environment.md)).

Config keys: [environment.md](environment.md). Smoke test: `tests/smoke/` (live Development).
