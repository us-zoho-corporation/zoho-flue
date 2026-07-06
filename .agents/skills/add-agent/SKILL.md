---
name: add-agent
description: Add a new Flue agent to this project. Use when creating a new agent file in src/agents/, wiring in providers, registering tools, or extending the project with a new agent capability.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/agents/<name>.ts` — export a default `defineAgent(...)`.
2. Import all settings via `src/config.ts`. Add any new env vars there (never inline `process.env`).
3. Document new env vars in `docs/environment.md`.
4. Providers live in `src/providers/` (wired via `registerProviders()`, invoked from `app.ts`),
   **not** in the agent. The Anthropic and Catalyst GLM providers are already available (see
   `config.chatModels` for the specs). If the agent needs a *new* provider, add it under
   `src/providers/` (see the `add-provider` skill).
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
    model: config.chatModels[0].spec, // or any '<provider>/<model>' specifier
    tools: [],
    instructions: 'Your system prompt here.',
}));
```

The Anthropic and Catalyst GLM providers are registered in `src/providers/` (`registerProviders()`) at startup, so an agent
using any spec from `config.chatModels` works without per-agent registration. Context size is
handled by Flue's built-in compaction (the provider sets `contextWindow`), so agents don't need
to tune it. See `src/agents/assistant.ts` as the reference — including how it resolves the
provider-model per conversation from the instance id.

## Checklist

- [ ] File created at `src/agents/<name>.ts`
- [ ] Default export is `defineAgent(...)`
- [ ] All settings read from `config.*`, not `process.env`
- [ ] New env vars added to `src/config.ts` and `docs/environment.md`
- [ ] `route` exported if HTTP access is needed
- [ ] Any new provider wired into `registerProviders()` in `src/providers/` (not the agent)
- [ ] Agent runs successfully with a test prompt
