# Get Record

`GET /crm/v8/{module}/{id}`

Fetches a single CRM record by ID with all its fields.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID |

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
- Returns HTTP 204 with an empty body if the ID doesn't resolve to a record.
