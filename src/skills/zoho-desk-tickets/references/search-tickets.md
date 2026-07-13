# Search Tickets

`GET /api/v1/tickets/search`

Wildcard / exact search for Desk tickets. Use when the user describes a ticket by partial subject, contact, account, or other attribute rather than giving an exact id.

## Parameters

| Name | Required | Description |
|---|---|---|
| subject | no | Wildcard match, e.g. `analysis*`. |
| status | no | Comma-separated statuses. |
| priority | no | Comma-separated priorities. |
| email | no | Wildcard email match. |
| contactName | no | Wildcard contact name. |
| accountName | no | Wildcard account name. |
| assigneeId | no | Agent id. |
| ticketNumber | no | Exact match. |
| createdTimeRange | no | ISO range, format `from,to`. |
| modifiedTimeRange | no | ISO range, format `from,to`. |
| limit | no | 1-100; default 10. |
| from | no | Starting index, 0-4999. |
| sortBy | no | `relevance` \| `modifiedTime` \| `createdTime` \| `customerResponseTime`. Prefix with `-` for descending. |

All params are optional; calling with none returns all tickets (no error). `searchStr` is not a supported param — an unrecognized param name returns `422`/`UNPROCESSABLE_ENTITY`, not a silent no-op.

## Scopes

`Desk.search.READ`, `Desk.tickets.READ`

## Notes

- Read-only, no HITL gate.
- Response is `{"data": [...], "count": N}` — a `data` array of normalized ticket objects plus a `count`.
- A search matching zero tickets returns `204 No Content` with an empty body.
- `limit` outside `1-100` or `from` outside `0-4999` returns `422`/`UNPROCESSABLE_ENTITY`.
- Wildcard fields (`subject`, `email`, `contactName`, `accountName`) require the literal `*` in the value to match partial strings; without it they match exact values only.
