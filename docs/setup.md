# Setup

## Prerequisites

- A Zoho OAuth client (Self Client) registered at [api-console.zoho.com](https://api-console.zoho.com/)
- A Catalyst project with QuickML GLM enabled

## One-time: obtain a refresh token

Zoho grant tokens expire in ~2 minutes, so run both steps without delay.

**Step 1** — generate a grant token from [api-console.zoho.com](https://api-console.zoho.com/) with the scopes your agent needs (e.g. `ZohoCRM.modules.ALL`).

**Step 2** — exchange it for a refresh token:

```bash
curl -s -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=<YOUR_CLIENT_ID>" \
  -d "client_secret=<YOUR_CLIENT_SECRET>" \
  -d "redirect_uri=<YOUR_REDIRECT_URI>" \
  -d "code=<GRANT_TOKEN>" | jq .refresh_token
```

Copy the `refresh_token` value into `.env` as `ZOHO_OAUTH_REFRESH_TOKEN`. It is long-lived and used to fetch a fresh access token on every agent startup.

> For step-by-step credential setup, activate the `zoho-oauth` skill.

## .env

Copy the template below, fill in your values, and save as `.env` at the repo root.

```
ZOHO_OAUTH_CLIENT_ID=
ZOHO_OAUTH_CLIENT_SECRET=
ZOHO_OAUTH_REFRESH_TOKEN=
CATALYST_ENDPOINT=
CATALYST_ORG_ID=
```

See [Environment](environment.md) for what each variable does.

## Zoho Knowledge Base MCP (optional)

The agent connects to `help-docs.zoho-forge.com/mcp` for documentation search. It requires a bearer token issued by that server, obtained once via browser OAuth.

To get a token: complete the OAuth flow at `https://help-docs.zoho-forge.com/authorize` (see the server's setup page), then copy the `access_token` from the `/token` response into `.env`:

```
ZOHO_DOCS_BEARER_TOKEN=<token>
```

The token is short-lived (~7 days); re-issue it when KB tools start failing with auth errors. Without this variable the agent starts normally — KB tools are simply unavailable.

## Adding a sandbox

By default agents use Flue's in-memory virtual sandbox (just-bash) — no configuration needed. For a provider-backed remote sandbox, run `flue add sandbox <provider>` to get the blueprint, write the generated file to `src/sandboxes/<provider>.ts` verbatim, and wire it in with `sandbox: <provider>(instance)` in `defineAgent`.

## Adding agents, providers, and skills

These task workflows are owned by skills — activate the relevant one rather than copying steps here:

- **New agent** → `add-agent` skill. (Providers are registered in `src/app.ts`, never in the agent module.)
- **New provider** → `add-provider` skill. (Register once in `src/app.ts`; set `contextWindow` for compaction.)
- **New skill** → `add-skill` skill. (agentskills.io spec + four-tier context conventions.)
