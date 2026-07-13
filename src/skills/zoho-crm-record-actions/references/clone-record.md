# Clone Record

`POST /crm/v8/{module}/{id}/actions/clone`

Clones/duplicates a CRM record, creating a copy with the same field values, including `Owner`.

No request body is required — an empty POST clones the record as-is. An optional body of `{"data": [{...field overrides...}]}` overrides specific fields on the new clone (e.g. `{"data": [{"Last_Name": "New Name"}]}` clones the record but sets `Last_Name` on the copy instead of carrying over the original's value).

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID to clone |
| data | no | Field-value pairs to override on the cloned copy. Sent as `{"data": [data]}` |

## Response

HTTP 201 with `{"data": [{"code": "SUCCESS", "details": {"id", "Modified_Time", "Modified_By", "Created_Time", "Created_By"}, "message": "record added", "status": "success"}]}` — the new record's ID is in `details.id`.

An invalid/nonexistent `record_id` returns HTTP 400: `{"code": "INVALID_DATA", "details": {"api_name": "id"}, "message": "the id given seems to be invalid", "status": "error"}` (not wrapped in a `data` array, unlike the success response).

## Scopes

`ZohoCRM.modules.{module}.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
