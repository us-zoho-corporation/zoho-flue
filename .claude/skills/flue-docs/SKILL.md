---
name: flue-docs
description: Search and read the Flue framework documentation using the bundled CLI. Use when you need to look up any Flue API, guide, concept, or ecosystem integration. Covers agents, workflows, channels, tools, routing, React SDK, sandboxes, schedules, skills, and more. Always use this skill before reading files in node_modules/@flue/.
allowed-tools: Bash
compatibility: Requires @flue/cli installed (pnpm exec flue docs)
---

## Accessing Flue docs

The Flue documentation is bundled inside `@flue/cli` and requires no network access.

**List every page (count varies by installed version):**
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
pnpm exec flue docs read reference/agent-api
```

## Key page paths (Flue 2.x)

| Category | Paths |
|---|---|
| Guides | `guide/building-agents`, `guide/agent-hooks`, `guide/channels`, `guide/react`, `guide/routing`, `guide/tools`, `guide/workflows`, `guide/models`, `guide/sandboxes`, `guide/schedules`, `guide/skills`, `guide/subagents`, `guide/observability`, `guide/database`, `guide/mcp`, `guide/durability`, `guide/migration` (v1 beta → v2) |
| API reference | `reference/agent-api`, `reference/agent-hooks-api`, `reference/provider-api`, `reference/data-persistence-api`, `reference/sandbox-api`, `reference/events`, `reference/errors`, `reference/streaming-protocol`, `reference/agent-behavior`, `reference/configuration` |
| SDK | `sdk/overview`, `sdk/flue-client`, `sdk/create-flue-client`, `sdk/events`, `sdk/errors` |
| CLI | `cli/overview`, `cli/run`, `cli/add`, `cli/update`, `cli/init`, `cli/docs` (no `cli/dev`/`cli/build` — Vite owns both, see `guide/migration`) |
| Getting started | `guide/getting-started`, `guide/why-flue` |
| Ecosystem | `ecosystem/channels/*` (Slack, Discord, GitHub, Zendesk, WhatsApp, etc.), `ecosystem/databases/*`, `ecosystem/sandboxes/*`, `ecosystem/deploy/*`, `ecosystem/tooling/*` |

## When to use which command

- **Unknown topic** → `flue docs search "<keywords>"` first, then `flue docs read <path>` on the top result.
- **Known guide section** → `flue docs read <path>` directly.
- **Full page list** → `flue docs` (no args).

Never read Flue source/docs files under `node_modules/@flue/` directly — use the CLI instead, which is version-matched and always up to date.
