# Update Ticket

`PATCH /api/v1/tickets/{id}`

Updates a ticket's fields — status, priority, assignee, resolution, subject, description, due date, etc. This is the only mutating operation in the entire Zoho Desk product surface.

## Parameters

| Name | Required | Description |
|---|---|---|
| id | yes | Ticket id (path parameter). |
| data | yes | PATCH body: key-value pairs of fields to change (e.g. `status`, `priority`, `assigneeId`, `resolution`, `subject`, `description`, `dueDate`). |

## Scopes

`Desk.tickets.UPDATE`

## Notes

- Mutating — requires human-in-the-loop approval before executing (only mutating operation in Zoho Desk). The approval card shows live dropdowns for `status` (Open, On Hold, Escalated, Closed) and a live `assigneeId` dropdown populated from List Agents. If the live agent fetch fails, the assignee dropdown is simply omitted from the card rather than failing the approval.
- `priority` is a free-text field, not a server-validated enum — the API accepts any string, including values outside Low/Medium/High/Urgent. Constrain it to those four values in the approval card by convention, not because the API enforces it.
- Field names inside `data` map directly to the keys shown/edited on the approval card.
- An unrecognized field name in `data` returns `422`/`UNPROCESSABLE_ENTITY` and the ticket is not modified.
- On success, returns the full updated ticket object (same shape as Get Ticket), not just the changed fields.
- Changing `priority` can trigger SLA re-evaluation, which may change `dueDate` and assign an `slaId` as a side effect.
