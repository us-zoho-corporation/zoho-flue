---
name: zoho-desk-accounts
description: List, fetch, and search Zoho Desk customer accounts (companies). Use when an agent needs to look up a customer company, browse account records, or find accounts by name in the Desk helpdesk context (distinct from CRM accounts).
---

Operations for listing, fetching, and searching Desk accounts (customer companies). All Desk API calls require the `orgId` header — see the `zoho-desk-organizations` skill.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Accounts](references/list-accounts.md) | `GET /api/v1/accounts` | List customer accounts, paginated. |
| [Get Account](references/get-account.md) | `GET /api/v1/accounts/{id}` | Fetch a single account by id. |
| [Search Accounts](references/search-accounts.md) | `GET /api/v1/accounts/search` | Exact/prefix/suffix match for accounts by name or other fields (not general substring). |

## Scopes

```
Desk.basic.READ
Desk.search.READ
```

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://desk.zoho.com`, with `headers: { orgId }` resolved via `zoho-desk-organizations` first. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-desk-accounts" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`PATCH`/`POST`/`PUT`/`DELETE`) must be confirmed with the user before executing.
