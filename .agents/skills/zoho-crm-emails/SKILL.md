---
name: zoho-crm-emails
description: Read emails associated with a Zoho CRM record (deal, contact, lead, etc.). Use when an agent needs to view a record's email history, e.g. "what emails have we sent this contact".
---

Read email history associated with a specific CRM record. Sending email from a record is out of scope for this specbook — see `AGENTS.md`'s "Excluded operations".

## Operations

| Operation | Method | Description |
|---|---|---|
| [Get Emails](references/get-emails.md) | `GET /crm/v8/{module}/{id}/Emails` | Get emails associated with a record |

## Scopes

`ZohoCRM.modules.READ`

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-emails" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
