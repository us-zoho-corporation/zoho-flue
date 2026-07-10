---
name: zoho-crm-records
description: List, search, get, create, update, and delete Zoho CRM records (Deals, Contacts, Accounts, Leads, Tasks, Events, Notes, Campaigns, Products, Vendors, Quotes, Sales_Orders, Invoices, Cases, Solutions, Calls, and custom modules). Use when an agent needs to read or write individual CRM records via the Zoho CRM v8 API — e.g. "show me my open deals", "create a new contact", "update this lead's stage", "delete this record".
---

Core CRUD operations against any CRM module's records, on `/crm/v8/...`. Schema/metadata changes (module and field definitions) live in the separate `zoho-crm-modules-and-fields` skill.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Records](references/list-records.md) | `GET /crm/v8/{module}` | List records in a module, sorted by `id` descending by default |
| [Search Records](references/search-records.md) | `GET /crm/v8/{module}/search` | Find records matching a criteria, word, email, or phone search |
| [Get Record](references/get-record.md) | `GET /crm/v8/{module}/{id}` | Fetch a single record by ID with all fields |
| [Create Record](references/create-record.md) | `POST /crm/v8/{module}` | Create one new record |
| [Update Record](references/update-record.md) | `PUT /crm/v8/{module}/{id}` | Update fields on an existing record |
| [Delete Record](references/delete-record.md) | `DELETE /crm/v8/{module}/{id}` | Delete a single record by ID |

## Scopes

`ZohoCRM.modules.READ` (list, search, get), `ZohoCRM.modules.{module}.CREATE`, `ZohoCRM.modules.{module}.UPDATE`, `ZohoCRM.modules.{module}.DELETE` (module name lowercased per module: deals, contacts, accounts, leads, tasks, events, notes, campaigns, products, vendors, quotes, salesorders, invoices, cases, solutions, calls — calls has CREATE/DELETE only, no UPDATE scope granted; Activities is a read-only composite view with no write scope).

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-records" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
