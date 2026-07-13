# Upload Attachment

`POST /crm/v8/{module}/{id}/Attachments`

Uploads a file attachment to a CRM record via `multipart/form-data`.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name, in path |
| id | yes | The record ID to attach the file to, in path |
| file | yes | Multipart form field containing the file (field name must be `file`). A request with no `file` field 400s with `INVALID_REQUEST` (`expected_type: Multipart Form Request`). |

Send as a standard multipart form part named `file`, e.g. `curl -F "file=@/path/to/local/file"`. There is no JSON-body form of this call.

## Response

`200` on success, with `data[]` containing `code: SUCCESS`, `message: "attachment uploaded successfully"`, and `details.id` (the new attachment ID).

Uploading to a record ID that doesn't exist (or isn't a valid record) returns `400 INVALID_DATA` (`related_status: invalid`, message `the related id given seems to be invalid`).

## Scopes

`ZohoCRM.modules.attachments.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
