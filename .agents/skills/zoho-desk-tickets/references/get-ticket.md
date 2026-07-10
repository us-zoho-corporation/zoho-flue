# Get Ticket

`GET /api/v1/tickets/{id}`

Fetches a single ticket by id. Use when the user references a specific ticket (by id or number) and wants its full details.

## Parameters

| Name | Required | Description |
|---|---|---|
| id | yes | Ticket id (path parameter). |
| include | no | Comma-separated side-loads: `contacts,products,assignee,departments,contract,isRead,team,skills`. |

## Scopes

`Desk.tickets.READ`

## Notes

- Read-only, no HITL gate.
- Returns a single normalized ticket object directly (not wrapped in a list or `data` envelope).
- An unknown or nonexistent ticket id returns `404` with `errorCode: URL_NOT_FOUND`.
