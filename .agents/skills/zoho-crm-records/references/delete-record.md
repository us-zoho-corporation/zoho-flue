# Delete Record

`DELETE /crm/v8/{module}/{id}`

Deletes a single CRM record by ID.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID to delete |

## Scopes

`ZohoCRM.modules.{module}.DELETE` (module name lowercased; `Sales_Orders` maps to scope segment `salesorders`; `Activities` has no write scope)

## Notes

- Mutating and destructive — requires HITL approval. Decision options restricted to approve / reject (no edit, no partial-response path — irrecoverable with no meaningful preview to edit against).
