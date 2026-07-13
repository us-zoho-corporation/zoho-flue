# Get Related Records

`GET /crm/v8/{module}/{id}/{related_module}`

Gets records from a related module linked to a specific parent record. Example: contacts for a deal, notes for an account.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | Parent module API name |
| record_id | yes | The parent record ID |
| related_module | yes | Related module API name |
| fields | **yes** | Comma-separated field list to retrieve. Omitting it fails with a 400 (`REQUIRED_PARAM_MISSING: fields`), same as List Records |
| per_page | no | Records per page. Default and max are both 200 |
| page | no | Page number, 1-indexed |

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
- Response shape matches List Records: a `data` array plus an `info` pagination object (`more_records` signals whether to fetch the next `page`).
