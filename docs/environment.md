# Environment Variables

Stored in `.env` at the repo root.

| Variable | Purpose |
|---|---|
| `ZOHO_OAUTH_CLIENT_ID` | OAuth client ID |
| `ZOHO_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_OAUTH_REFRESH_TOKEN` | Long-lived refresh token exchanged for access token at startup |
| `CATALYST_ENDPOINT` | QuickML GLM chat endpoint URL |
| `CATALYST_ORG_ID` | Catalyst org ID — sent as `CATALYST-ORG` request header |
| `ANTHROPIC_API_KEY` | API key for the built-in `anthropic` provider — required for the default `claude` model option (`anthropic/claude-sonnet-5`). |
| `ZOHO_DOCS_BEARER_TOKEN` | *(Optional)* Bearer token from `help-docs.zoho-forge.com`; enables KB MCP tools. Short-lived (~7 days) — re-issue via browser OAuth when KB tools start failing. |
| `FLUE_API_SECRET` | *(Optional)* Shared secret required on `/api/*` requests via the `x-flue-secret` header. Unset = unauthenticated (dev only). |
| `FLUE_CORS_ORIGINS` | *(Optional)* Comma-separated allowed CORS origins. Defaults to localhost dev origins. |
