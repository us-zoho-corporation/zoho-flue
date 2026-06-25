---
name: add-agent
description: Add a new Flue agent to this project. Use when creating a new agent file in src/agents/, wiring in providers, registering tools, or extending the project with a new agent capability.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/agents/<name>.ts` — export a default `defineAgent(...)`.
2. Import all settings via `src/config.ts`. Add any new env vars there (never inline `process.env`).
3. Document new env vars in `docs/environment.md`.
4. Providers are registered once in `src/app.ts`, **not** in the agent. The default Catalyst
   model (`config.model`) is already available. If the agent needs a *new* provider, register
   it in `src/app.ts` (see the `add-provider` skill).
5. Export `route` if the agent should be reachable over HTTP at `POST /agents/<name>/:id`
   (the chat UI and SDK require it).
6. Verify: `pnpm exec flue run <name> --input '{"message":"hello"}'`

## Template

```typescript
import { defineAgent, type AgentRouteHandler } from '@flue/runtime';
import { config } from '../config';

// Expose the agent over HTTP (required for the chat UI / SDK).
export const route: AgentRouteHandler = async (_c, next) => next();

export default defineAgent(() => ({
    model: config.model,
    tools: [],
    instructions: 'Your system prompt here.',
}));
```

The Catalyst GLM provider is registered in `src/app.ts` at startup, so any agent using
`config.model` works without per-agent registration. Context size is handled by Flue's
built-in compaction (the provider sets `contextWindow`), so agents don't need to tune it.
See `src/agents/main.ts` as the reference implementation.

## Checklist

- [ ] File created at `src/agents/<name>.ts`
- [ ] Default export is `defineAgent(...)`
- [ ] All settings read from `config.*`, not `process.env`
- [ ] New env vars added to `src/config.ts` and `docs/environment.md`
- [ ] `route` exported if HTTP access is needed
- [ ] Any new provider registered in `src/app.ts` (not the agent)
- [ ] Agent runs successfully with a test prompt
