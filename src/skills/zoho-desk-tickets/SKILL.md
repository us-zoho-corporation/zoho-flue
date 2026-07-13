---
name: zoho-desk-tickets
description: List, fetch, search, and update Zoho Desk support tickets, and read a ticket's conversation timeline. Use when an agent needs to triage, look up, filter, or report on helpdesk tickets. Updating a ticket (status, priority, assignee, resolution) is the only mutating operation in Zoho Desk and requires human-in-the-loop approval before executing.
---

Operations for listing, fetching, searching, and updating support tickets, plus reading a ticket's conversation timeline. All Desk API calls require the `orgId` header — see the `zoho-desk-organizations` skill.

## Operations

| Operation | Method | Description |
|---|---|---|
| [List Tickets](references/list-tickets.md) | `GET /api/v1/tickets` | List tickets with filters (status, priority, assignee, channel, department). |
| [Get Ticket](references/get-ticket.md) | `GET /api/v1/tickets/{id}` | Fetch a single ticket by id. |
| [Update Ticket](references/update-ticket.md) | `PATCH /api/v1/tickets/{id}` | Update ticket fields (status, priority, assignee, resolution, etc). Mutating — HITL-gated. |
| [Search Tickets](references/search-tickets.md) | `GET /api/v1/tickets/search` | Wildcard / exact search across ticket fields. |
| [Get Ticket Conversation](references/get-ticket-conversation.md) | `GET /api/v1/tickets/{id}/conversations` | Ordered timeline of customer threads and agent comments. |

## Scopes

```
Desk.tickets.READ
Desk.tickets.UPDATE
Desk.search.READ
```

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://desk.zoho.com`, with `headers: { orgId }` resolved via `zoho-desk-organizations` first. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-desk-tickets" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`PATCH`/`POST`/`PUT`/`DELETE`) must be confirmed with the user before executing.
