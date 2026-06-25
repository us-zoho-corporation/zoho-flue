---
name: add-agent
description: Add a new Flue agent to this project. Use when creating a new agent file in src/agents/, wiring in providers, registering tools, or extending the project with a new agent capability.
allowed-tools: Bash Read Edit Write
---

## Steps

1. Create `src/agents/<name>.ts` — export a default `defineAgent(...)`.
2. Import all settings via `src/config.ts`. Add any new env vars there (never inline `process.env`).
3. Document new env vars in `docs/environment.md`.
4. Register providers at the top using top-level `await`.
5. Verify: `pnpm exec flue run <name> --input '{"message":"hello"}'`

## Template

```typescript
import { defineAgent } from '@flue/runtime';
import { config } from '../config';
import { registerCatalystGLM } from '../providers/catalyst-glm';
import { getZohoAccessToken } from '../providers/zoho-auth';

const token = await getZohoAccessToken({
    clientId: config.zohoClientId,
    clientSecret: config.zohoClientSecret,
    refreshToken: config.zohoRefreshToken,
});

registerCatalystGLM({
    endpoint: config.catalystEndpoint,
    orgId: config.catalystOrgId,
    token,
    oauth: {
        clientId: config.zohoClientId,
        clientSecret: config.zohoClientSecret,
        refreshToken: config.zohoRefreshToken,
    },
});

export default defineAgent(() => ({
    model: config.model,
    tools: [],
    instructions: 'Your system prompt here.',
}));
```

See `src/agents/main.ts` as the reference implementation.

## Checklist

- [ ] File created at `src/agents/<name>.ts`
- [ ] Default export is `defineAgent(...)`
- [ ] All settings read from `config.*`, not `process.env`
- [ ] New env vars added to `src/config.ts` and `docs/environment.md`
- [ ] Agent runs successfully with a test prompt
