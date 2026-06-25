---
name: add-skill
description: Add a new agent skill to this project following the agentskills.io specification and tiered context loading conventions. Use when creating a new skill directory under .agents/skills/, writing a SKILL.md, or deciding what belongs in Tier 1 (AGENTS.md) vs Tier 3 (skill body) vs Tier 4 (references/).
allowed-tools: Read Edit Write
---

## agentskills.io spec requirements

Each skill is a directory under `.agents/skills/` containing a `SKILL.md` file:

```
.agents/skills/<name>/
├── SKILL.md          # Required
├── references/       # Optional: detail loaded on demand
└── scripts/          # Optional: executable code
```

### SKILL.md frontmatter

```yaml
---
name: <name>                  # Required. Lowercase, hyphens only. Must match directory name exactly.
description: <description>    # Required. Max 1024 chars. State WHAT it does and WHEN to use it.
compatibility: <...>          # Optional. Environment requirements (system packages, etc.)
allowed-tools: Bash Read      # Optional/experimental. Space-separated pre-approved tools.
---
```

**`name` rules:** 1–64 chars, `a-z 0-9 -` only, no leading/trailing/consecutive hyphens, must exactly match the parent directory name.

**`description` rules:** phrase as "Do X. Use when Y" — the description is the only signal agents use to decide whether to activate this skill.

## Tiered context loading — where content belongs

This project uses a four-tier structure to maximise prompt cache hit rate. Earlier tiers are stable and always loaded; later tiers are volatile and loaded on demand.

| Tier | Location | Loaded when | Rule |
|---|---|---|---|
| 1 | `AGENTS.md` | Every session | Invariant project identity, directory map, code conventions only. Never change. |
| 2 | Skill `name` + `description` | Every session | Stable trigger keywords. Avoid changing once written. |
| 3 | Skill `SKILL.md` body | On skill activation | Step-by-step instructions, critical gotchas, templates. |
| 4 | `references/` files | On demand from body | Detailed specs, lookup tables, long format docs. |

**Cache invalidation risk by tier:**
- Changing Tier 1 (AGENTS.md) → invalidates entire system prompt cache (worst)
- Changing Tier 2 (skill description) → invalidates skill catalog in system prompt
- Changing Tier 3 (skill body) → no cache invalidation (safe)
- Changing Tier 4 (references) → no cache invalidation (safe)

## What belongs where

**Put in AGENTS.md (Tier 1) only if:**
- It applies to every coding task in the project (e.g. a code convention)
- It never changes as the project evolves
- Omitting it would cause agents to silently break something

**Put in a skill body (Tier 3):**
- Step-by-step workflows for a specific task
- Gotchas and non-obvious constraints for that task
- Short templates or checklists

**Put in references/ (Tier 4):**
- Detailed format specs longer than ~30 lines
- Lookup tables agents need only occasionally
- Content the skill body can load conditionally ("read references/X.md if you see error Y")

**Do NOT add to AGENTS.md:**
- Anything task-specific (it belongs in a skill)
- Env var names, specific filenames, agent names — these change as the project grows
- Doc links — skills replace that indexing function

## Steps to add a new skill

1. Create `.agents/skills/<name>/` — name must be lowercase, hyphen-separated.
2. Write `SKILL.md` with frontmatter and instructions.
3. If any section is longer than ~30 lines of detail, move it to `references/<topic>.md` and add a conditional load instruction at the bottom of the body (e.g. "Read `references/X.md` if you need the full spec").
4. Verify the skill description triggers correctly: it should include the specific error messages, file paths, or task verbs an agent would see when this skill is relevant.
