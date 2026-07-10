# Get Ticket Conversation

`GET /api/v1/tickets/{id}/conversations`

Fetches the conversation timeline for a ticket — customer threads and agent comments in chronological order. Use after Get Ticket to read what was actually said.

## Parameters

| Name | Required | Description |
|---|---|---|
| id | yes | Ticket id (path parameter). |
| from | no | Starting index. |
| limit | no | Number of entries to return (1-100). |

## Scopes

`Desk.tickets.READ`

## Notes

- Read-only, no HITL gate.
- Response is `{"data": [...]}` — entries are heterogeneous (customer threads vs. agent comments) and are returned as the raw list under `data` rather than coerced into a single normalized model.
- `from` and `limit` are not validated: out-of-range or non-numeric values are silently ignored rather than rejected.
- A nonexistent ticket id returns `200` with an empty `data` array, not a `404`.
