---
name: zoho-crm-attachments
description: List, upload, and delete file attachments on a Zoho CRM record. Use when an agent needs to manage files attached to a record — e.g. "attach this receipt to the deal", "what files are on this account", "remove that attachment".
---

List, upload, and delete file attachments on a CRM record.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Attachments](references/list-attachments.md) | `GET /crm/v8/{module}/{id}/Attachments` | List file attachments on a record |
| [Upload Attachment](references/upload-attachment.md) | `POST /crm/v8/{module}/{id}/Attachments` | Upload a file attachment (multipart) |
| [Delete Attachment](references/delete-attachment.md) | `DELETE /crm/v8/{module}/{id}/Attachments/{attachment_id}` | Delete a specific file attachment |

## Scopes

`ZohoCRM.modules.attachments.READ`, `ZohoCRM.modules.attachments.CREATE`, `ZohoCRM.modules.attachments.DELETE`

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-attachments" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
