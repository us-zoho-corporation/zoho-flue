---
name: zoho-oauth
description: Set up or refresh Zoho OAuth credentials for this project. Use when obtaining a new refresh token for .env, filling in ZOHO_OAUTH_* variables, troubleshooting authentication failures at startup, or refreshing an expired ZOHO_DOCS_BEARER_TOKEN.
allowed-tools: Bash Read
---

## Required .env variables

```
ZOHO_OAUTH_CLIENT_ID=
ZOHO_OAUTH_CLIENT_SECRET=
ZOHO_OAUTH_REFRESH_TOKEN=
CATALYST_ENDPOINT=
CATALYST_ORG_ID=
```

Optional (enables KB MCP tools):

```
ZOHO_DOCS_BEARER_TOKEN=
```

## Step 1: create a Self Client

Register at [api-console.zoho.com](https://api-console.zoho.com/) → Self Client. Copy the client ID and secret into `.env`.

## Step 2: obtain a refresh token

Grant tokens expire in ~2 minutes — run both steps without delay.

1. Generate a grant token from [api-console.zoho.com](https://api-console.zoho.com/) with the scopes your agent needs (e.g. `ZohoCRM.modules.ALL`).

2. Exchange it for a refresh token:

```bash
curl -s -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=<YOUR_CLIENT_ID>" \
  -d "client_secret=<YOUR_CLIENT_SECRET>" \
  -d "redirect_uri=<YOUR_REDIRECT_URI>" \
  -d "code=<GRANT_TOKEN>" | jq .refresh_token
```

Copy the value into `.env` as `ZOHO_OAUTH_REFRESH_TOKEN`. It is long-lived.

## Step 3: obtain a Zoho Docs token (optional)

1. Complete the browser OAuth flow at `https://help-docs.zoho-forge.com/authorize`.
2. Copy the `access_token` from the `/token` response into `.env` as `ZOHO_DOCS_BEARER_TOKEN`.
3. This token is short-lived (~7 days). The app does not check or report its expiry — when
   KB tools start failing with auth errors, repeat this step to get a fresh one.

## How auth works at runtime

`src/app.ts` exchanges the refresh token for a live access token at startup (top-level `await`
via `getZohoAccessToken`) and registers the Catalyst GLM provider with it. On a 401,
`src/providers/catalyst-glm.ts` refreshes the token once via `getZohoAccessToken` and retries
automatically. `ZOHO_DOCS_BEARER_TOKEN` is used directly by the KB MCP client
(`src/mcp/zoho-kb.ts`) and is not refreshed automatically.
