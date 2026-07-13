# Create Record

`POST /crm/v8/{module}`

Creates a new record in any CRM module.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| data | yes | Field-value pairs for the new record, sent as request body `{"data": [data]}` |

## Scopes

`ZohoCRM.modules.{module}.CREATE` (module name lowercased; `Sales_Orders` maps to scope segment `salesorders`; `Activities` is a read-only composite view with no write scope — write to `Tasks` or `Events` directly)

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
