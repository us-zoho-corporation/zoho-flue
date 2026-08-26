---
name: add-agent
description: Add a new Flue agent to this project. Use when creating a new agent file in src/agents/, wiring in providers, registering tools, or extending the project with a new agent capability.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/agents/<name>.ts` — start the file with the `'use agent'` directive (before any
   imports), then export a capitalized function. Flue's Vite plugin scans the project at build
   time for that directive and registers every exported, capitalized function it finds as an
   addressable agent — there is no `defineAgent(...)` config bag and no filename convention;
   the exported function's name (or an `agentName` static override, see below) *is* the agent's
   durable storage identity.
2. Import all settings via `src/config.ts`. Add any new env vars there (never inline `process.env`).
3. Document new env vars in `docs/environment.md`.
4. Providers live in `src/providers/` (wired via `registerProviders()`, invoked from `app.ts`),
   **not** in the agent. The built-in Anthropic provider is already available (see
   `config.chatModels` for the specs). If the agent needs a *new* provider, add it under
   `src/providers/` (see the `add-provider` skill).
5. Mount the agent over HTTP explicitly in `src/app.ts` if it should be reachable there — Flue
   v2 has no automatic routing, so `app.route('/agents/<name>', createAgentRouter(TheAgentFn))`
   is a required, separate step from registration (step 1 makes the agent *addressable*; this
   makes it *reachable over HTTP*). `dispatch(...)` can still drive an agent that's registered
   but never mounted.
6. Verify: `pnpm exec flue run src/agents/<name>.ts --message "hello"` (runs the agent module
   directly, transport-free — no server, no `app.ts` involved). Only works if the agent has
   no session dependency — `assistant` calls `getAuth()`, which needs secrets `app.ts` bootstraps
   at startup, so this verification step doesn't apply to it (see the `run-agent` skill for how
   to exercise it instead).

## Template

```typescript
'use agent';
import { type AgentProps, useModel, useTool } from '@flue/runtime';
import { config } from '../config';

export function MyAgent({ id }: AgentProps): string {
	useModel(config.chatModels[0].spec); // or any '<provider>/<model>' specifier
	// useTool(someTool) for each tool this render needs — the function re-renders
	// before every model turn, so tools/model can be computed per turn.
	return 'Your system prompt here.';
}
// Optional: pin the durable storage identity independent of the function name.
// MyAgent.agentName = 'my-agent';
```

```typescript
// src/app.ts — mounting is a separate, explicit step
import { createAgentRouter } from '@flue/runtime/routing';
import { MyAgent } from './agents/my-agent';

app.route('/agents/my-agent', createAgentRouter(MyAgent));
```

The built-in Anthropic provider is registered in `src/providers/` (`registerProviders()`) at startup, so an agent
using any spec from `config.chatModels` works without per-agent registration. Context size is
handled by Flue's built-in compaction (the provider's `Model` objects carry `contextWindow`), so agents don't need
to tune it. See `src/agents/assistant.ts` as the reference — including how it resolves the
provider-model per conversation from the instance id (`modelForConversation`), reads per-turn
context via `currentTurnContext`/`TurnContext` (`src/auth/request-context.ts`) instead of
`AsyncLocalStorage`, and mounts tools fresh on every render with `useTool`.

## Checklist

- [ ] File created at `src/agents/<name>.ts`, starting with the `'use agent'` directive
- [ ] Exported a capitalized function (not `defineAgent(...)` — that beta API is gone in Flue v2)
- [ ] All settings read from `config.*`, not `process.env`
- [ ] New env vars added to `src/config.ts` and `docs/environment.md`
- [ ] Mounted explicitly in `src/app.ts` via `createAgentRouter(...)` if HTTP access is needed
- [ ] Any new provider wired into `registerProviders()` in `src/providers/` (not the agent)
- [ ] Agent runs successfully with `flue run src/agents/<name>.ts --message "..."`
