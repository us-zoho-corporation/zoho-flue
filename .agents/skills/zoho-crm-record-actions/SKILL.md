---
name: zoho-crm-record-actions
description: Perform single-record actions in Zoho CRM beyond plain CRUD — clone/duplicate a record, reassign its owner, or convert a Lead into a Contact/Account/Deal. Use when an agent needs to duplicate a record, change who owns it, or convert a lead, e.g. "clone this deal", "reassign this account to Jane", "convert this lead".
---

Actions performed on a single record beyond plain CRUD: duplicating a record, reassigning ownership, and converting a Lead into a Contact/Account/Deal.

## Operations

| Operation | Method | Description |
|---|---|---|
| [Clone Record](references/clone-record.md) | `POST /crm/v8/{module}/{id}/actions/clone` | Duplicate a record with the same field values, with optional field overrides |
| [Change Owner](references/change-owner.md) | `PUT /crm/v8/{module}/{id}` | Reassign a record's owner (wraps Update Record) |
| [Convert Lead](references/convert-lead.md) | `POST /crm/v8/Leads/{id}/actions/convert` | Convert a Lead into a Contact + Account, and optionally a Deal — irreversible |

## Scopes

`ZohoCRM.modules.{module}.CREATE` (clone), `ZohoCRM.modules.{module}.UPDATE` (change owner), `ZohoCRM.modules.leads.UPDATE` (convert lead)

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-record-actions" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
