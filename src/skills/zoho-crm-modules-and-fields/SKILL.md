---
name: zoho-crm-modules-and-fields
description: Inspect and extend Zoho CRM schema via the Settings API (v8) — list modules, get a module's metadata, list/create fields, and create whole custom modules. Use when an agent needs to discover CRM schema or make admin-level structural changes, e.g. "what modules exist", "what fields does Deals have", "add a custom field", "create a new custom module". Distinct from record data, which is covered by zoho-crm-records.
---

Inspect and extend CRM schema via the Settings API (v8) — list modules, get a module's detail, list/create fields, and create whole custom modules. Distinct from record data, which is covered by zoho-crm-records.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Modules](references/list-modules.md) | `GET /crm/v8/settings/modules` | List all available CRM modules (system + custom) |
| [Get Module Detail](references/get-module-detail.md) | `GET /crm/v8/settings/modules/{module}` | Get metadata for one specific module |
| [Get Fields](references/get-fields.md) | `GET /crm/v8/settings/fields` | Get field definitions for a module (not layout-scoped — no picklist values) |
| [Get Layouts](references/get-layouts.md) | `GET /crm/v8/settings/layouts` | Get a module's layouts — layout id, and layout-scoped picklist values |
| [Get Pipelines](references/get-pipelines.md) | `GET /crm/v8/settings/pipeline` | Get a Deals layout's valid pipelines and each one's valid stages |
| [Create Field](references/create-field.md) | `POST /crm/v8/settings/fields` | Create a custom field on a module |
| [Create Module](references/create-module.md) | `POST /crm/v8/settings/modules` | Create a new custom CRM module, then add initial fields |

## Scopes

`ZohoCRM.settings.modules.READ` (list/get module), `ZohoCRM.settings.fields.READ` (get fields), `ZohoCRM.settings.layouts.READ` (get layouts), `ZohoCRM.settings.pipeline.READ` (get pipelines), `ZohoCRM.settings.fields.ALL` (create/delete field), `ZohoCRM.settings.modules.ALL` (create/delete module, profile lookup during module creation)

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-modules-and-fields" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
