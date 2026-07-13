# List Users

`GET /crm/v8/users?type={type}`

Gets CRM users. Useful for finding owner IDs before calling Change Owner (see the `zoho-crm-record-actions` skill).

## Parameters

| Name | Required | Description |
|---|---|---|
| type | no | User type filter, case-sensitive. One of `AllUsers` (default when omitted), `ActiveUsers`, `DeactiveUsers`, `AdminUsers`, `ActiveConfirmedAdmins`, `ConfirmedUsers`, `NotConfirmedUsers`, `DeletedUsers`, `ActiveConfirmedUsers`, `CurrentUser`. An unrecognized or wrong-case value (e.g. `allusers`) 400s with `PATTERN_NOT_MATCHED`. |
| fields | no | Comma-separated field names to restrict the response to. Omitted → full user object per user. |
| page | no | Page number, default `1`. |
| per_page | no | Page size, default `200`. |

## Response shape

`{"users": [{...}, ...], "info": {"per_page": ..., "count": ..., "page": ..., "more_records": ...}}`. A `type` with no matching users (e.g. `DeactiveUsers` when none are deactivated) returns `204 No Content` with an empty body.

## Scopes

`ZohoCRM.users.READ`

## Notes

- Read-only, no HITL approval required.
- Also used internally (not as a standalone tool call) by Create Module (see the `zoho-crm-modules-and-fields` skill) to derive profile IDs.
