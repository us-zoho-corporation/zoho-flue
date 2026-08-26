---
name: add-provider
description: Register a new LLM or API provider in this project. Use when adding a new model endpoint, auth provider, or API integration to src/providers/.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/providers/<name>.ts`.
2. Build a Pi `Provider` object with `createProvider(...)` (from `@earendil-works/pi-ai`) and
   register it with `setProvider(...)` (from `@flue/runtime`) — Flue v2's provider layer is
   Pi's own provider protocol; the beta's `registerProvider`/`registerApiProvider` config-bag
   APIs are gone entirely, replaced by `setProvider(createProvider({ id, auth, models, api }))`.
   For a custom (non-catalog) provider, declare full `Model` objects (each carries its own
   `baseUrl` and metadata: `contextWindow`, `maxTokens`, `reasoning`, `input`, cost) — there is
   no separate override surface. To re-register a built-in under its own id (e.g. to swap in a
   different credential source), reuse its catalog models: `models: anthropicProvider().getModels()`.
3. Export a `register<Name>()` function and add a call to it in `registerProviders()`
   (`src/providers/index.ts`), which `src/app.ts` invokes once at startup. Provider setup
   lives in `src/providers/`, never in agent modules (`app.ts` is loaded for the dev server and
   the built server, so providers are registered before any agent resolves its model — but
   `flue run` loads only the target agent module, never `app.ts`, so a provider a `flue run`
   invocation needs must also be registered from the agent module itself).
4. For custom (non-catalog) providers, set `contextWindow` and `maxTokens` on each declared
   `Model` object so Flue's built-in compaction triggers correctly.
5. Read all required settings via `src/config.ts`, not `process.env` directly.
6. Add required env vars to `src/config.ts` with `required()` and document in `docs/environment.md`.
7. Write unit tests colocated as `src/providers/<name>.test.ts`.

See `src/providers/anthropic.ts` as the reference implementation — it's the only registered
provider today (credential-only: reuses the Anthropic catalog's own models, with a credential
resolver that reads `config.anthropicApiKey` instead of Pi's own env lookup).

## Checklist

- [ ] Provider file at `src/providers/<name>.ts`
- [ ] Built with `createProvider({ id, auth, models, api })` (Pi's API) + `setProvider(...)` —
      not the removed `registerProvider`/`registerApiProvider`
- [ ] Exported `register<Name>()` function
- [ ] Wired into `registerProviders()` in `src/providers/index.ts`
- [ ] All env vars in `src/config.ts` (`required()` if mandatory)
- [ ] `docs/environment.md` updated
- [ ] Colocated unit tests in `src/providers/<name>.test.ts`
- [ ] `contextWindow`/`maxTokens` set on each `Model` object for non-catalog providers
