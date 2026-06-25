---
name: add-provider
description: Register a new LLM or API provider in this project. Use when adding a new model endpoint, auth provider, or API integration to src/providers/.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/providers/<name>.ts`.
2. Call `registerApiProvider` or `registerProvider` from `@flue/runtime` to wire it into Flue.
3. Export a `register*` function and call it once from `src/app.ts` at startup — runtime
   provider setup belongs in `app.ts`, not in agent modules (Flue loads `app.ts` for every
   run mode, so the provider is registered before any agent resolves its model).
4. For custom (non-catalog) providers, set `contextWindow` (and `maxTokens`) on the
   registration so Flue's built-in compaction triggers correctly.
5. Read all required settings via `src/config.ts`, not `process.env` directly.
6. Add required env vars to `src/config.ts` with `required()` and document in `docs/environment.md`.
7. Write unit tests in `src/providers/<name>.test.ts`.

See `src/providers/catalyst-glm.ts` as the reference implementation.

## Checklist

- [ ] Provider file at `src/providers/<name>.ts`
- [ ] Exported `register*` function
- [ ] All env vars in `src/config.ts` with `required()` wrapper
- [ ] `docs/environment.md` updated
- [ ] Unit tests in `src/providers/<name>.test.ts`
- [ ] Provider registered once in `src/app.ts` (not in agent modules)
- [ ] `contextWindow` set on the registration for non-catalog providers
