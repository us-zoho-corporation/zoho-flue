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
| `SESSION_SECRET` | HMAC key for signed session/login cookies (≥32 bytes) |
| `DATA_ENCRYPTION_KEY` | AES-256-GCM key(s) for encrypting stored refresh tokens. Form `keyId:base64(32B)`, comma-separated; first = active for new writes, all usable for decryption (rotation) |
| `CATALYST_PROJECT_ID` | Catalyst project ID (from `.catalystrc`) — used in Data Store REST URLs |
| `CATALYST_ENVIRONMENT` | *(Optional)* Catalyst environment for the `Environment` header. Default `Development`. |
| `CATALYST_API_BASE_URL` | *(Optional)* Catalyst Data Store REST base. Default `https://api.catalyst.zoho.com/baas/v1`. |
| `STORE_BACKEND` | *(Optional)* `catalyst` (Data Store) or `memory` (dev/tests before tables exist). Default `catalyst`. |
| `MCP_MAX_SERVERS_PER_USER` | *(Optional)* Max external MCP servers a user may connect. Default 20. |
| `SESSION_TTL_SECONDS` | *(Optional)* Session lifetime in seconds. Default 30 days. |
| `ANTHROPIC_API_KEY` | API key for the built-in `anthropic` provider — required for the default `claude` model option (`anthropic/claude-sonnet-5`). |
| `ZOHO_DOCS_BEARER_TOKEN` | *(Optional)* Bearer token from `help-docs.zoho-forge.com`; enables KB MCP tools. Short-lived (~7 days) — re-issue via browser OAuth when KB tools start failing. |
| `FLUE_API_SECRET` | *(Optional)* Shared secret required on `/api/*` requests via the `x-flue-secret` header. Unset = unauthenticated (dev only). |
| `FLUE_CORS_ORIGINS` | *(Optional)* Comma-separated allowed CORS origins. Defaults to localhost dev origins. |
