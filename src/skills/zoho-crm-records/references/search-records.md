# Search Records

`GET /crm/v8/{module}/search`

Finds CRM records matching a criteria expression, free-text word, email, or phone value. Can return multiple matching records, not just one.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| criteria | one of criteria/email/phone/word required | Filter string: `(Field_Name:operator:value)` joined with `and`/`or`. Operators: `equals`, `starts_with`, `in`, and others per field type. Example: `(Stage:equals:Negotiation)`, `(Amount:greater_than:50000)and(Stage:not_equal:Closed Won)`. When present, takes precedence over `word` — the two are not combined |
| word | one of criteria/email/phone/word required | Free-text search across the module's searchable fields (not limited to one "primary" field — matches substrings inside text/description fields too) |
| email | one of criteria/email/phone/word required | Search by email field value |
| phone | one of criteria/email/phone/word required | Search by phone field value |
| page | no | Page number, 1-indexed |
| per_page | no | Records per page, default and max 200 |
| fields | no | Comma-separated field list to restrict the response to |

Omitting all four of `criteria`/`email`/`phone`/`word` returns a 400 (`MANDATORY_NOT_FOUND`, naming `criteria` regardless of which one is actually missing).

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
- Returns HTTP 204 with an empty body if nothing matches — there is no `data` array to check in that case.
- Response shape matches List Records: a `data` array plus an `info` pagination object.
