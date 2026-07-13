# Get Emails

`GET /crm/v8/{module}/{id}/Emails`

Gets emails associated with a CRM record.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name (path segment), e.g. `Contacts`, `Leads`, `Deals`, `Accounts` |
| id | yes | The record ID (path segment) |

No query parameters are required. Unrecognized query parameters are silently ignored rather than erroring.

## Response

```json
{"Emails": []}
```

`Emails` is a flat array (no `data` wrapper). Empty history returns HTTP 200 with `"Emails": []`, not 204.

## Error behavior

| Condition | Status | Body |
|---|---|---|
| Nonexistent record ID, or a module that doesn't support the Emails related list (e.g. `Tasks`) | 204 | empty |
| Non-numeric / malformed record ID | 400 | `INVALID_DATA` — "the related id given seems to be invalid" |
| Invalid/unknown module name | 400 | `INVALID_MODULE` — "the module name given seems to be invalid" |

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
