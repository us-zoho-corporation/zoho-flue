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

## Adding a sandbox

By default agents use Flue's in-memory virtual sandbox (just-bash) — no configuration needed. For a provider-backed remote sandbox, run `flue add sandbox <provider>` to get the blueprint, write the generated file to `src/sandboxes/<provider>.ts` verbatim, and wire it in with `sandbox: <provider>(instance)` in `defineAgent`.

## Adding an agent

1. Create `src/agents/<name>.ts` — export a default `defineAgent(...)`.
2. Import from `src/config.ts`; add new env vars or static settings there and document in `docs/environment.md`.
3. Register any providers it needs at the top (top-level `await` is fine).
4. Run it: `pnpm exec flue run <name> --input '{"message":"..."}'`

## Adding a provider

1. Create `src/providers/<name>.ts`.
2. Call `registerApiProvider` / `registerProvider` from `@flue/runtime` to wire it into Flue.
3. Export a `register*` function for agents to call at startup.
4. Read any required settings via `src/config.ts`, not `process.env` directly.

See `src/providers/catalyst-glm.ts` as the reference implementation.
