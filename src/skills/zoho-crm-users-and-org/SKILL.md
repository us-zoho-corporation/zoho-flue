---
name: zoho-crm-users-and-org
description: Read Zoho CRM users and organization-level information — list users (optionally filtered by type), get org info (company name, domain, plan, currency), and get the current authenticated user's profile. Use when an agent needs to find a user/owner ID, look up org settings, or answer "who am I" / "who are the CRM users".
---

Read CRM users and organization-level information.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Users](references/list-users.md) | `GET /crm/v8/users` | Get CRM users, optionally filtered by type |
| [Get Org Info](references/get-org-info.md) | `GET /crm/v8/org` | Get organization information |
| [Get Current User](references/get-current-user.md) | `GET /crm/v8/users?type=CurrentUser` | Get the authenticated user's own profile |

## Scopes

`ZohoCRM.users.READ` (list users, current user), `ZohoCRM.org.READ` (org info)

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-users-and-org" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
