# Environment Variables

Stored in `.env` at the repo root.

| Variable | Purpose |
|---|---|
| `ZOHO_OAUTH_CLIENT_ID` | OAuth client ID (shared by the service account and per-user login) |
| `ZOHO_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_OAUTH_REFRESH_TOKEN` | Service-account refresh token exchanged for the app access token at startup (GLM provider, Catalyst Data Store). Must carry `ZohoCatalyst.tables.rows.{CREATE,READ,UPDATE,DELETE}` + `ZohoCatalyst.zcql.CREATE` for Data Store writes. |
| `CATALYST_ENDPOINT` | QuickML GLM chat endpoint URL |
| `CATALYST_ORG_ID` | Catalyst org ID — sent as `CATALYST-ORG` request header |
| `ZOHO_OAUTH_REDIRECT_URI` | Per-user OAuth callback URL, registered on the Zoho OAuth client (e.g. `http://localhost:3583/api/auth/callback`) |
| `ZOHO_LOGIN_SCOPES` | *(Optional)* Scopes requested at login (comma- or space-separated). Default `AaaServer.profile.READ,QuickML.deployment.READ` (profile for identity; QuickML so the user's token can reach the Zoho GLM 4.7 Flash endpoint). Granted scopes are stored per user and expanded incrementally. |
| `CATALYST_PROJECT_ID` | Catalyst project ID (from `.catalystrc`) — used in Data Store REST URLs |
| `CATALYST_ENVIRONMENT` | *(Optional)* Catalyst environment for the `Environment` header. Default `Development`. |
| `CATALYST_API_BASE_URL` | *(Optional)* Catalyst Data Store REST base. Default `https://api.catalyst.zoho.com/baas/v1`. |
| `STORE_BACKEND` | *(Optional)* `catalyst` (Data Store) or `memory` (dev/tests before tables exist). Default `catalyst`. |
| `ENV` | *(Optional)* Deployment environment. Set to `local` or `CI` **only** to enable the `/api/auth/dev-login` test seam (mints a session for a fake empty-state user, no Zoho — used by the [e2e-chat](skills.md) harness). Any other value (or unset) keeps it disabled (`404`). Never set to `local`/`CI` in production. |
| `SESSION_TTL_SECONDS` | *(Optional)* Session lifetime in seconds. Default 30 days. |
| `ANTHROPIC_API_KEY` | API key for the built-in `anthropic` provider — required for the default `claude` model option (`anthropic/claude-sonnet-5`). |
| `ZOHO_DOCS_BEARER_TOKEN` | *(Optional)* Bearer token from `help-docs.zoho-forge.com`; enables KB MCP tools. Short-lived (~7 days) — re-issue via browser OAuth when KB tools start failing. |
| `FLUE_API_SECRET` | *(Optional)* Shared secret required on `/api/*` requests via the `x-flue-secret` header. Unset = unauthenticated (dev only). |
| `FLUE_CORS_ORIGINS` | *(Optional)* Comma-separated allowed CORS origins. Defaults to localhost dev origins. |

> **Not env vars:** the signed-cookie secret and the refresh-token encryption key are generated in-memory at startup (see `src/config.ts`), never configured. They're opaque values with no meaning as configuration. Because they're process-scoped, sessions and refresh tokens encrypted at rest don't survive a restart or span instances — users simply re-authenticate. Acceptable for this single-process app.
