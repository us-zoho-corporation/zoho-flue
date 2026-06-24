# Environment Variables

Stored in `.env` at the repo root.

| Variable | Purpose |
|---|---|
| `ZOHO_OAUTH_CLIENT_ID` | OAuth client ID |
| `ZOHO_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_OAUTH_REFRESH_TOKEN` | Long-lived refresh token exchanged for access token at startup |
| `CATALYST_ENDPOINT` | QuickML GLM chat endpoint URL |
| `CATALYST_ORG_ID` | Catalyst org ID — sent as `CATALYST-ORG` request header |
| `ZOHO_DOCS_TOKEN` | *(Optional)* JWT from `help-docs.zoho-forge.com`; enables KB MCP tools. Valid 7 days — re-run the browser OAuth flow to refresh. |
