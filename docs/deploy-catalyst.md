# Deploying to Zoho Catalyst

The app deploys as a Catalyst **AppSail** service, not Functions — Flue's Node target is a
long-running Hono server (`dist/server.mjs`), not a stateless request/response function.

## Why AppSail, and why 1 instance

AppSail supports 1–5 auto-scaling instances, but this app is pinned to **1 instance**
deliberately. Flue's engine state (conversation/run/event/submission streams, attachments)
*is* durable here — `src/db.ts` exports a Catalyst-backed `PersistenceAdapter` (NoSQL +
Stratus), so state survives restarts and redeploys (see [flue-persistence.md](flue-persistence.md)).
What durability does **not** buy is active-active: Flue requires "one live Node owner routed
per agent instance" regardless of backend (its own Postgres guidance says the same), and
AppSail's load balancer has no documented sticky-session feature. Pinning to 1 instance
satisfies the single-owner requirement. The adapter's producer-epoch fence and
compare-and-set transitions still protect correctness across the brief owner overlap of a
redeploy/failover.

## One-time Catalyst Console setup

The CLI can't do these — AppSail service creation and its environment variables are
Console-only (confirmed: `catalyst-config.json` env vars are ignored for AppSail).

1. **Create the AppSail service** — Console → AppSail → New:
   - Stack: Node.js (`node20`)
   - Start command: `node scripts/catalyst-start.mjs`
   - Build command: `pnpm install --frozen-lockfile && pnpm run chat:build && pnpm exec flue build --target node`
   - Instances: **min = max = 1**
   - Memory: 512MB+ (raise if it OOMs)
2. **Set environment variables** — Console → AppSail → your service → Configuration →
   Environment Variables. Everything in [environment.md](environment.md) except `PORT`
   (Catalyst injects the real port as `X_ZOHO_CATALYST_LISTEN_PORT`;
   `scripts/catalyst-start.mjs` maps it). In particular: set `STORE_BACKEND=catalyst`, a
   production `ZOHO_OAUTH_REDIRECT_URI` (also register it on the Zoho OAuth client),
   `FLUE_API_SECRET`, and `FLUE_CORS_ORIGINS` for the real deployed domain. Never set `ENV`
   to `local`/`CI`.
3. Create the storage the backend needs, then switch `STORE_BACKEND` to `catalyst`:
   the NoSQL auth tables + Cache segment (sessions) + `AppSecrets` Data Store table in
   [auth.md](auth.md), and the Flue-engine NoSQL tables + Stratus bucket in
   [flue-persistence.md](flue-persistence.md). Set `CATALYST_CACHE_SEGMENT`,
   `CATALYST_STRATUS_BUCKET`, and `CATALYST_STRATUS_OBJECT_URL`. Validate the NoSQL wire
   behavior once with `node scripts/nosql-probe.mjs` against a scratch table.

## Linking and deploying

Once the service exists and its env vars are set:

```bash
catalyst appsail:add       # link this directory to the AppSail service you created
catalyst deploy --only appsail
```

## Chat UI

Served same-origin from the same AppSail process (`app.ts` serves `src/chat/dist` as
static files + SPA fallback) rather than as a separate Slate app — this sidesteps the
documented Slate↔AppSail cross-origin/auth-layer issue entirely.
