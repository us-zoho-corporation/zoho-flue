---
name: zoho-crm-bulk-operations
description: Create, upsert, or delete many Zoho CRM records at once — batch create up to 100 records, idempotent create-or-update via upsert, or bulk delete-all with automatic pagination and batching. Use when an agent needs to write or remove multiple CRM records in one operation rather than one at a time, e.g. "import these 50 leads", "delete all Closed Lost deals".
---

Multi-record writes and deletes against a CRM module — batch create, upsert (idempotent create-or-update), and bulk delete with automatic pagination.

## Operations

| Operation | Method | Description |
|---|---|---|
| [Batch Create](references/batch-create.md) | `POST /crm/v8/{module}` | Create up to 100 records in a single call |
| [Upsert](references/upsert.md) | `POST /crm/v8/{module}/upsert` | Create-or-update up to 100 records based on duplicate-check fields |
| [Delete All Records](references/delete-all-records.md) | `DELETE /crm/v8/{module}?ids=` | Delete every record in a module (or matching a filter) by listing IDs then batch-deleting them |

## Scopes

`ZohoCRM.modules.{module}.CREATE` (batch create, upsert), `ZohoCRM.modules.{module}.DELETE` (delete all records).

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-bulk-operations" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
