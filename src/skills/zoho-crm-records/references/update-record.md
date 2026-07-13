# Update Record

`PUT /crm/v8/{module}/{id}`

Updates fields on an existing CRM record. Pass only the fields to change.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID to update |
| data | yes | Field-value pairs to update, sent as request body `{"data": [data]}` |

## Scopes

`ZohoCRM.modules.{module}.UPDATE` (module name lowercased; `Sales_Orders` maps to scope segment `salesorders`; `Activities` has no write scope; note `calls` has no UPDATE scope granted in this app's OAuth consent even though the API supports it)

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- `change_record_owner` is a thin wrapper over this same endpoint (sets only the `Owner` field) — see Change Owner in the `zoho-crm-record-actions` skill.
