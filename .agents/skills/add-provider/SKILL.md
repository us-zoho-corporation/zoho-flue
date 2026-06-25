---
name: add-provider
description: Register a new LLM or API provider in this project. Use when adding a new model endpoint, auth provider, or API integration to src/providers/.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/providers/<name>.ts`.
2. Call `registerApiProvider` or `registerProvider` from `@flue/runtime` to wire it into Flue.
3. Export a `register*` function for agents to call at startup.
4. Read all required settings via `src/config.ts`, not `process.env` directly.
5. Add required env vars to `src/config.ts` with `required()` and document in `docs/environment.md`.
6. Write unit tests in `src/providers/<name>.test.ts`.

See `src/providers/catalyst-glm.ts` as the reference implementation.

## Checklist

- [ ] Provider file at `src/providers/<name>.ts`
- [ ] Exported `register*` function
- [ ] All env vars in `src/config.ts` with `required()` wrapper
- [ ] `docs/environment.md` updated
- [ ] Unit tests in `src/providers/<name>.test.ts`
- [ ] Provider registered in the relevant agent at `src/agents/*.ts`
