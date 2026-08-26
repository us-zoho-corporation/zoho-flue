# Providers

Every **model provider** (in the Flue sense — [Pi](https://pi.dev/docs/latest/providers)'s `createProvider()` + Flue's `setProvider()`) lives in `src/providers/` and is wired in through one `registerProviders()` call (`src/providers/index.ts`) that `src/app.ts` invokes at startup. Provider setup belongs here, not in agent modules — Flue loads `app.ts` in every run mode, so providers are registered before any agent resolves its model.

Credential/OAuth helpers are **not** providers; they live in `src/auth/` (see [architecture.md](architecture.md) → Auth).

| File | Provider |
|---|---|
| `index.ts` | `registerProviders()` — registers all of the below |
| `anthropic.ts` | Anthropic Claude (built-in Flue provider; credential-only) |

## `anthropic.ts`

Anthropic Claude is one of Flue's **built-in catalog providers**, reachable with only `ANTHROPIC_API_KEY` in the environment. `registerAnthropic()` re-registers it explicitly anyway: it fails fast at startup if an `anthropic/*` model is offered in `config.chatModels` without a key, then reuses the catalog's own models (`anthropicProvider().getModels()`) with a credential resolver that reads `config.anthropicApiKey` instead of Pi's own env lookup, via `createProvider({ id: 'anthropic', auth, models, api: anthropicMessagesApi() })` + `setProvider(...)`.

---

Zoho OAuth token exchange is **not a provider** — it lives in `src/auth/zoho-auth.ts` and backs the Catalyst NoSQL/Data Store/Stratus clients' service-account credentials. See [architecture.md](architecture.md) → Auth, and the `zoho-oauth` skill for the credential flow.
