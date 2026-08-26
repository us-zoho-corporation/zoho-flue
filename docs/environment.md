# Environment Variables

Stored in `.env` at the repo root.

| Variable | Purpose |
|---|---|
| `ZOHO_OAUTH_CLIENT_ID` | OAuth client ID (shared by the service account and per-user login) |
| `ZOHO_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_OAUTH_REFRESH_TOKEN` | Service-account refresh token exchanged for the app access token at startup (Catalyst NoSQL/Cache/Data Store/Stratus). **Not** used by the `zoho_api` tool — that runs as the logged-in user, using their own connection (see `docs/auth.md`). Must carry `ZohoCatalyst.nosql.item.{CREATE,READ,UPDATE}` (NoSQL stores + Flue engine state), `ZohoCatalyst.cache.{CREATE,READ,DELETE}` (Cache sessions), `ZohoCatalyst.tables.rows.{CREATE,READ,UPDATE,DELETE}` + `ZohoCatalyst.zcql.CREATE` (the `AppSecrets` Data Store table), `ZohoCatalyst.buckets.objects.{CREATE,READ,DELETE}` (Stratus attachment bytes). Must have been issued from the SAME data center as `ZOHO_DOMAIN_SUFFIX` below — a refresh token from a different data center fails with `invalid_code` regardless of how valid it otherwise is. |
| `ZOHO_DOMAIN_SUFFIX` | *(Optional)* Data-center suffix for the shared service account's own accounts domain (`accounts.zoho.<suffix>`), used as the fallback accounts domain for `/api/photo` when a user's own stored connection predates capturing it: `com` (US), `eu`, `in`, `com.au`, `com.cn`, or `jp`. Default `com`. Does **not** affect `zoho_api` — it runs as the logged-in user and accepts every known Zoho data center's domain, since different users can each be in a different one. Per-user connections (Settings → Connections) capture their own data center automatically at login. |
| `CATALYST_ORG_ID` | Catalyst org ID — sent as `CATALYST-ORG` request header |
| `ZOHO_OAUTH_REDIRECT_URI` | Per-user OAuth callback URL, registered on the Zoho OAuth client (e.g. `http://localhost:3583/api/auth/callback`) |
| `ZOHO_LOGIN_SCOPES` | *(Optional)* Scopes requested at login (comma- or space-separated). Default `AaaServer.profile.READ,ZohoCRM.org.READ` (profile for identity; org read so the profile popup can show the user's Zoho CRM organization name). Granted scopes are stored per user and expanded incrementally. |
| `CATALYST_PROJECT_ID` | Catalyst project ID (from `.catalystrc`) — used in Data Store REST URLs |
| `CATALYST_ENVIRONMENT` | *(Optional)* Catalyst environment for the `Environment` header. Default `Development`. |
| `CATALYST_API_BASE_URL` | *(Optional)* Catalyst REST base (NoSQL, Data Store, Stratus management). Default `https://api.catalyst.zoho.com/baas/v1`. |
| `CATALYST_CACHE_SEGMENT` | Numeric Cache segment id backing the session store (console-created, or the project's default segment). Required when `STORE_BACKEND=catalyst`. |
| `CATALYST_STRATUS_BUCKET` | Stratus bucket name for Flue attachment bytes. Required when `STORE_BACKEND=catalyst`; unused for `memory`. See [flue-persistence.md](flue-persistence.md). |
| `CATALYST_STRATUS_OBJECT_URL` | Stratus bucket object host, copied from the console (Development appends `-development`, e.g. `https://myapp-flue-development.zohostratus.com`). Required when `STORE_BACKEND=catalyst`. |
| `STORE_BACKEND` | *(Optional)* `catalyst` (NoSQL auth stores + Data Store secrets, and the Catalyst Flue persistence adapter) or `memory` (dev/tests + in-memory Flue SQLite). Default `catalyst`. |
| `ENV` | *(Optional)* Deployment environment. Set to `local` or `CI` **only** to enable the `/api/auth/dev-login` test seam (mints a session for a fake empty-state user, no Zoho — used by the [e2e-chat](skills.md) harness). Any other value (or unset) keeps it disabled (`404`). Never set to `local`/`CI` in production. |
| `SESSION_TTL_SECONDS` | *(Optional)* Session lifetime in seconds — a sliding idle timeout (each throttled touch re-extends it) and the Cache entry TTL. Default 2 hours; must stay within Cache's 48h cap. |
| `ANTHROPIC_API_KEY` | API key for the built-in `anthropic` provider — required for the default `claude` model option (`anthropic/claude-sonnet-5`). |
| `ZOHO_DOCS_ENDPOINT` | *(Optional)* Zoho-Documentation MCP server URL. Default `https://help-docs.zoho-forge.com/mcp`. |
| `DOCS_OAUTH_CLIENT_ID` | *(Optional)* Client ID for the docs knowledge-base MCP server's own OAuth 2.1 authorization server (`help-docs.zoho-forge.com` — NOT accounts.zoho.com), from a one-time dynamic client registration (RFC 7591) against its `/register` endpoint. Enables the docs connection/KB tools; unset disables them entirely. See `docs/auth.md`. |
| `DOCS_OAUTH_CLIENT_SECRET` | *(Optional)* Client secret from that same registration. |
| `DOCS_OAUTH_REDIRECT_URI` | *(Optional)* Per-user docs OAuth callback URL, must exactly match the redirect URI given at client registration (e.g. `http://localhost:3583/api/auth/docs/callback`). Only needed when `DOCS_OAUTH_CLIENT_ID` is set. |
| `FLUE_API_SECRET` | *(Optional)* Shared secret required on `/api/*` requests via the `x-flue-secret` header. Unset = unauthenticated (dev only). |
| `FLUE_CORS_ORIGINS` | *(Optional)* Comma-separated allowed CORS origins. Defaults to localhost dev origins. |
