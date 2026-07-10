# Agent Skills

Skills live in `.agents/skills/`. This project follows the [agentskills.io](https://agentskills.io/specification) open specification and a four-tier context loading design to maximise prompt cache hit rate.

## Specification compliance

Each skill is a directory containing a `SKILL.md` file:

```
.agents/skills/<name>/
├── SKILL.md          # Required: YAML frontmatter + Markdown instructions
├── references/       # Optional: detail files loaded on demand
└── scripts/          # Optional: executable code
```

### SKILL.md frontmatter

```yaml
---
name: <name>          # Required. Lowercase a-z 0-9 hyphens. Must match directory name exactly.
description: <...>    # Required. Max 1024 chars. "Does X. Use when Y."
compatibility: <...>  # Optional. Environment requirements.
allowed-tools: <...>  # Optional/experimental. Space-separated pre-approved tools.
---
```

`name` constraints: 1–64 chars, `a-z 0-9 -` only, no leading/trailing/consecutive hyphens, must exactly match the parent directory name.

## Four-tier context loading

| Tier | Location | Loaded when | Cache impact if changed |
|---|---|---|---|
| 1 | `AGENTS.md` | Every session | Invalidates entire system prompt cache |
| 2 | Skill `name` + `description` | Every session | Invalidates skill catalog in system prompt |
| 3 | Skill `SKILL.md` body | On skill activation | None |
| 4 | `references/` files | On demand from body | None |

**Design rule:** the most frequently changing content must sit at the highest-numbered tier. Tiers 1 and 2 should be treated as immutable once written.

### What belongs where

**Tier 1 — `AGENTS.md` only:** content that applies to every coding task and never changes as the project grows (project identity, directory map, invariant code conventions). Do not add task-specific content, env var names, agent names, or doc links.

**Tier 3 — skill body:** step-by-step workflows, critical gotchas, short templates. Keep under 500 lines.

**Tier 4 — `references/`:** detailed specs, lookup tables, long format docs. Load conditionally: "Read `references/X.md` if you encounter error Y."

## Existing skills

| Skill | When to activate |
|---|---|
| `add-skill` | Adding a new skill to this project |
| `flue-docs` | Searching and reading Flue framework documentation via CLI |
| `run-agent` | Running the agent, tests, type-check, lint, or the browser chat UI |
| `e2e-chat` | Full browser E2E of the chat from an authenticated empty state (dev-login seam) |
| `add-agent` | Creating a new agent in `src/agents/` |
| `add-provider` | Registering a new provider in `src/providers/` |
| `catalyst-glm` | Debugging GLM responses, history format, EXTRA_KEY_FOUND_IN_JSON |
| `zoho-kb-mcp` | Working with the KB MCP client in `src/mcp/` |
| `zoho-oauth` | Setting up or refreshing Zoho OAuth credentials |

### Zoho CRM/Desk implementation skills

Runtime operation catalog for the `assistant` agent's `zoho_skill_get` tool (`src/tools/zoho-skills.ts`) — each is
also readable as a dev-time reference. Executed via the shared `zoho_api` tool (`src/tools/zoho-api.ts`); Desk
skills additionally need `orgId` resolved via `zoho-desk-organizations` (see `docs/architecture.md`).

| Skill | When to activate |
|---|---|
| `zoho-crm-records` | Listing, searching, getting, creating, updating, or deleting CRM records |
| `zoho-crm-modules-and-fields` | Inspecting or extending CRM schema (modules, fields) |
| `zoho-crm-query` | Cross-module COQL queries (joins, GROUP BY) |
| `zoho-crm-bulk-operations` | Batch create, upsert, or bulk delete of CRM records |
| `zoho-crm-record-actions` | Cloning a record, reassigning ownership, converting a Lead |
| `zoho-crm-related-records` | Traversing related-module records or a record's audit timeline |
| `zoho-crm-attachments` | Listing, uploading, or deleting file attachments on a CRM record |
| `zoho-crm-emails` | Reading a CRM record's associated email history |
| `zoho-crm-users-and-org` | Listing CRM users, org info, or the current user's profile |
| `zoho-crm-workflow-automation` | Creating/inspecting CRM Workflow Rules and their actions |
| `zoho-desk-organizations` | Resolving the Desk `orgId` — bootstrap for every other Desk call |
| `zoho-desk-tickets` | Listing, fetching, searching, or updating Desk tickets |
| `zoho-desk-accounts` | Listing, fetching, or searching Desk customer accounts |
| `zoho-desk-contacts` | Listing, fetching, or searching Desk contacts |
| `zoho-desk-agents-and-departments` | Listing Desk support agents and departments |
