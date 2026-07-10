# Get Current User

`GET /crm/v8/users?type=CurrentUser`

Fetches the authenticated CRM user's own profile: name, email, role, profile, time zone, locale, theme, and other account settings. Same endpoint as [List Users](list-users.md) with `type=CurrentUser`.

## Parameters

| Name | Required | Description |
|---|---|---|
| type | yes | Must be `CurrentUser` |
| fields | no | Comma-separated field names to restrict the response to (e.g. `id,full_name,email`). Omitted → full user object. |

## Response shape

`{"users": [{...}], "info": {"per_page": 200, "count": 1, "page": 1, "more_records": false}}` — `users` is a single-element array.

## Scopes

`ZohoCRM.users.READ`

## Notes

- Read-only, no HITL approval required.
