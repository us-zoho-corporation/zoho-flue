---
name: flue-docs
description: Search and read the Flue framework documentation using the bundled CLI. Use when you need to look up any Flue API, guide, concept, or ecosystem integration. Covers agents, workflows, channels, tools, routing, React SDK, sandboxes, schedules, skills, and more. Always use this skill before reading files in node_modules/@flue/.
allowed-tools: Bash
compatibility: Requires @flue/cli installed (pnpm exec flue docs)
---

## Accessing Flue docs

The Flue documentation is bundled inside `@flue/cli` and requires no network access.

**List all 97 pages:**
```sh
pnpm exec flue docs
```

**Search by keyword (returns ranked JSON):**
```sh
pnpm exec flue docs search "chat"
pnpm exec flue docs search "route export"
pnpm exec flue docs search "cors"
```

**Read a specific page as Markdown:**
```sh
pnpm exec flue docs read guide/react
pnpm exec flue docs read guide/routing
pnpm exec flue docs read api/agent-api
```

## Key page paths

| Category | Paths |
|---|---|
| Guides | `guide/building-agents`, `guide/channels`, `guide/react`, `guide/routing`, `guide/tools`, `guide/workflows`, `guide/models`, `guide/sandboxes`, `guide/schedules`, `guide/skills`, `guide/subagents`, `guide/observability`, `guide/database` |
| API reference | `api/agent-api`, `api/action-api`, `api/workflow-api`, `api/routing-api`, `api/provider-api`, `api/events-reference`, `api/errors-reference`, `api/streaming-protocol` |
| SDK | `sdk/overview`, `sdk/client`, `sdk/agents`, `sdk/workflows`, `sdk/runs`, `sdk/events` |
| CLI | `cli/dev`, `cli/run`, `cli/build`, `cli/add`, `cli/docs` |
| Config | `reference/configuration` |
| Getting started | `getting-started/quickstart` |
| Ecosystem channels | `ecosystem/channels/slack`, `ecosystem/channels/discord`, `ecosystem/channels/github`, `ecosystem/channels/google-chat`, `ecosystem/channels/teams` |

## When to use which command

- **Unknown topic** → `flue docs search "<keywords>"` first, then `flue docs read <path>` on the top result.
- **Known guide section** → `flue docs read <path>` directly.
- **Full page list** → `flue docs` (no args).

Never read `node_modules/@flue/runtime/docs/` directly — use the CLI instead, which is version-matched and always up to date.
