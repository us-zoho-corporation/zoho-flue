---
name: zoho-desk-contacts
description: List, fetch, and search Zoho Desk contacts (the people who raise support tickets). Use when an agent needs to look up a customer contact, browse contact records, or find a contact by name/email in the Desk helpdesk context.
---

Operations for listing, fetching, and searching Desk contacts (the people who raise tickets). All Desk API calls require the `orgId` header — see the `zoho-desk-organizations` skill.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Contacts](references/list-contacts.md) | `GET /api/v1/contacts` | List contacts, paginated. |
| [Get Contact](references/get-contact.md) | `GET /api/v1/contacts/{id}` | Fetch a single contact by id. |
| [Search Contacts](references/search-contacts.md) | `GET /api/v1/contacts/search` | Search contacts by name, email, phone, or account (substring match on most fields, exact match on `lastName`/`accountName`). |

## Scopes

```
Desk.contacts.READ
Desk.search.READ
```

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://desk.zoho.com`, with `headers: { orgId }` resolved via `zoho-desk-organizations` first. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-desk-contacts" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`PATCH`/`POST`/`PUT`/`DELETE`) must be confirmed with the user before executing.
