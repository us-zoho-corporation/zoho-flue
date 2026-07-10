# Change Owner

`PUT /crm/v8/{module}/{id}`

Changes the owner of a CRM record. This is not a distinct Zoho endpoint — it is Update Record (see the `zoho-crm-records` skill) called with a body that sets only the `Owner` field: `{"data": [{"Owner": new_owner_id}]}`. Use List Users (see the `zoho-crm-users-and-org` skill) to find the new owner's ID first.

`Owner` takes the target user's ID as a bare string, not an object, e.g. `{"Owner": "7320477000000595001"}`.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID |
| new_owner_id | yes | The user ID of the new owner |

## Response

Same shape as Update Record: HTTP 200 with `{"data": [{"code": "SUCCESS", "details": {"id", "Modified_Time", "Modified_By", "Created_Time", "Created_By"}, "message": "record updated", "status": "success"}]}`.

An `Owner` value that isn't a valid user ID (e.g. malformed or nonexistent) returns HTTP 400: `{"data": [{"code": "INVALID_DATA", "details": {"expected_data_type": "bigint", "api_name": "Owner", "json_path": "$.data[0].Owner"}, "message": "invalid data", "status": "error"}]}`.

## Scopes

`ZohoCRM.modules.{module}.UPDATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
