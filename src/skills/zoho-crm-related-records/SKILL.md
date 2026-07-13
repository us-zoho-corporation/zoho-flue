---
name: zoho-crm-related-records
description: Traverse related-module records linked to a specific Zoho CRM record (e.g. contacts for a deal, notes for an account), and inspect a record's activity/audit timeline. Use when an agent needs to see what's linked to a record or its change history — e.g. "what contacts are on this deal", "show the audit trail for this account".
---

Traverse related-module records linked to a specific record, and inspect a record's activity timeline / audit trail.

## Operations

| Operation | Method | Description |
|---|---|---|
| [Get Related Records](references/get-related-records.md) | `GET /crm/v8/{module}/{id}/{related_module}` | Get records from a related module linked to a specific record |
| [Get Timeline](references/get-timeline.md) | `GET /crm/v8/{module}/{id}/__timeline` | Get the activity/audit timeline for a record |

## Scopes

`ZohoCRM.modules.READ`

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-related-records" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
