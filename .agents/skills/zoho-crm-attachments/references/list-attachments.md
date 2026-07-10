# List Attachments

`GET /crm/v8/{module}/{id}/Attachments`

Lists file attachments on a CRM record.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name, in path |
| id | yes | The record ID, in path |
| fields | yes | Comma-separated list of attachment fields to return (e.g. `File_Name,Size`). Omitting it 400s with `REQUIRED_PARAM_MISSING` (`param_name: fields`). `id` is always returned regardless of what's requested. |
| page | no | Page number, default `1` |
| per_page | no | Records per page, default `200` |

## Response

`data[]` items include the requested `fields` plus `id`. Available fields include `File_Name`, `Size` (string, bytes), `Owner`, `Created_Time`, `Modified_Time`, and `Parent_Id` (object with `id`, `name`, and `module.api_name`).

`info` carries standard pagination metadata: `per_page`, `page`, `count`, `more_records`, `next_page_token`, `previous_page_token`, `page_token_expiry`.

## Scopes

`ZohoCRM.modules.attachments.READ`

## Notes

- Read-only.
- A record with no attachments returns HTTP 204 with an empty body, not `[]`.
