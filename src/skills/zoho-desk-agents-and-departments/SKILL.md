---
name: zoho-desk-agents-and-departments
description: List Zoho Desk support agents and help-desk departments. Use when an agent needs to find who to assign or reassign a ticket to, report on the support team, or scope tickets/searches by department.
---

Operations for listing support agents and help-desk departments. All Desk API calls require the `orgId` header — see the `zoho-desk-organizations` skill.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Agents](references/list-agents.md) | `GET /api/v1/agents` | List support agents (id, name, emailId, status), filterable by status/department. |
| [List Departments](references/list-departments.md) | `GET /api/v1/departments` | List help-desk departments, filterable by enabled state. |

## Scopes

```
Desk.basic.READ
Desk.settings.READ
```

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://desk.zoho.com`, with `headers: { orgId }` resolved via `zoho-desk-organizations` first. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-desk-agents-and-departments" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`PATCH`/`POST`/`PUT`/`DELETE`) must be confirmed with the user before executing.
