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

1. Generate a grant token from [api-console.zoho.com](https://api-console.zoho.com/) with the scopes your agent needs. To cover every CRM/Desk implementation skill (see `docs/skills.md`), request all of these together (comma-delimited, no spaces):

```
AaaServer.profile.READ,ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.bulk.ALL,ZohoCRM.notifications.ALL,ZohoCRM.coql.READ,ZohoCRM.users.READ,ZohoCRM.org.READ,Desk.basic.READ,Desk.search.READ,Desk.settings.READ,Desk.contacts.READ,Desk.tickets.READ,Desk.tickets.UPDATE
```

Each `zoho-crm-*` / `zoho-desk-*` skill's `## Scopes` section lists exactly which of these it needs.

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

Token exchange lives in `src/auth/zoho-auth.ts` (`getZohoAccessToken`, cached + auto-refreshed) —
it is an auth helper, not a Flue model provider. It backs the shared service-account credential
used by the Catalyst NoSQL/Cache/Data Store/Stratus clients (`src/store/catalyst/`) and, keyed
per user, `getUserToken` — never a model provider (the only registered provider is the built-in
`anthropic` one, credential-only via `ANTHROPIC_API_KEY`; see `docs/providers.md`). On a 401,
each Catalyst client refreshes the token once via `getZohoAccessToken` and retries automatically.
`ZOHO_DOCS_BEARER_TOKEN` is used directly by the KB MCP client (`src/mcp/zoho-kb.ts`) and is not
refreshed automatically.
