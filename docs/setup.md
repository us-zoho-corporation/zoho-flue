# Setup

## Prerequisites

- An Anthropic API key — required for the default `claude-sonnet-5` model (startup fails without it)
- A Zoho OAuth client (Self Client) registered at [api-console.zoho.com](https://api-console.zoho.com/)

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
ANTHROPIC_API_KEY=
ZOHO_OAUTH_CLIENT_ID=
ZOHO_OAUTH_CLIENT_SECRET=
ZOHO_OAUTH_REFRESH_TOKEN=
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

Flue v2 gives an agent **no sandbox unless you attach one** — the assistant agent doesn't use one today. For a provider-backed remote sandbox, run `flue add sandbox <provider>` to fetch the blueprint (a Markdown implementation guide your coding agent applies, not a package installer), write the resulting file to `src/sandboxes/<provider>.ts`, and attach it inside the agent function with `useSandbox(<provider>(instance))`.

## Adding agents, providers, and skills

These task workflows are owned by skills — activate the relevant one rather than copying steps here:

- **New agent** → `add-agent` skill. (Providers live in `src/providers/`, never in the agent module.)
- **New provider** → `add-provider` skill. (Wire it into `registerProviders()` in `src/providers/index.ts`; set `contextWindow` on the `Model` objects for compaction.)
- **New skill** → `add-skill` skill. (agentskills.io spec + four-tier context conventions.)

## Deploying

See [Deploying to Zoho Catalyst](deploy-catalyst.md) for the AppSail setup, required Console steps, and NoSQL/Data Store/Stratus creation.
