# List Tickets

`GET /api/v1/tickets`

Lists Desk tickets with optional filters. Use for broad filtered lists: by status, priority, assignee, channel, or department. Defaults to 25 tickets when `limit` is omitted.

## Parameters

| Name | Required | Description |
|---|---|---|
| from | no | Starting index (pagination offset). |
| limit | no | Number of tickets to return (1-100). |
| status | no | Comma-separated statuses (e.g. Open, On Hold, Escalated, Closed). |
| priority | no | Comma-separated priorities (Low, Medium, High, Urgent). |
| assignee | no | Agent id, `Unassigned`, or comma-separated ids. |
| channel | no | Origin channel (Email, Web, Phone, Chat, etc). |
| sortBy | no | Sort field: `responseDueDate`, `customerResponseTime`, `createdTime`. Prefix with `-` for descending. |
| departmentIds | no | Comma-separated department ids. |
| include | no | Side-loads: `contacts,products,departments,team,isRead,assignee`. |
| receivedInDays | no | Filter to recent customer response: `15`, `30`, or `90`. |
| viewId | no | Optional saved view id to scope the list. |
| teamIds | no | Comma-separated team ids. |
| fields | no | Comma-separated field names to include in the response. |

## Scopes

`Desk.tickets.READ`

## Notes

- Read-only, no HITL gate.
- Response is `{"data": [...]}` — a `data` array of normalized ticket objects. No `count` field.
- A filter that matches zero tickets returns `204 No Content` with an empty body, not `200` with an empty array.
- An unrecognized `status` or similar filter value is treated as a non-match (`204`) rather than a validation error. `receivedInDays` and `viewId` are validated server-side and return `422`/`INVALID_DATA` on bad input.
