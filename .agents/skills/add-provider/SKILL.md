---
name: add-provider
description: Register a new LLM or API provider in this project. Use when adding a new model endpoint, auth provider, or API integration to src/providers/.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/providers/<name>.ts`.
2. Call `registerApiProvider` or `registerProvider` from `@flue/runtime` to wire it into Flue.
3. Export a `register<Name>()` function and add a call to it in `registerProviders()`
   (`src/providers/index.ts`), which `src/app.ts` invokes once at startup. Provider setup
   lives in `src/providers/`, never in agent modules (Flue loads `app.ts` for every run mode,
   so providers are registered before any agent resolves its model).
4. For custom (non-catalog) providers, set `contextWindow` (and `maxTokens`) on the
   registration so Flue's built-in compaction triggers correctly.
5. Read all required settings via `src/config.ts`, not `process.env` directly.
6. Add required env vars to `src/config.ts` with `required()` and document in `docs/environment.md`.
7. Write unit tests colocated as `src/providers/<name>.test.ts`.

See `src/providers/catalyst-glm.ts` (custom adapter) and `src/providers/anthropic.ts` (built-in) as reference implementations.

## Checklist

- [ ] Provider file at `src/providers/<name>.ts`
- [ ] Exported `register<Name>()` function
- [ ] Wired into `registerProviders()` in `src/providers/index.ts`
- [ ] All env vars in `src/config.ts` (`required()` if mandatory)
- [ ] `docs/environment.md` updated
- [ ] Colocated unit tests in `src/providers/<name>.test.ts`
- [ ] `contextWindow` set on the registration for non-catalog providers
