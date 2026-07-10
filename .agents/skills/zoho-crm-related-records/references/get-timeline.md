# Get Timeline

`GET /crm/v8/{module}/{id}/__timeline`

Gets the activity timeline/audit trail for a CRM record — related-record associations, field changes, and who/what performed them.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| record_id | yes | The record ID |
| per_page | no | Entries per page |

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
- Response entries are under the `__timeline` key, not `data`.
- Paginates via `next_page_token`/`previous_page_token` in the response `info` object rather than a `page` number.
- Returns HTTP 204 with an empty body if there's no history.
