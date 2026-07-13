# List Departments

`GET /api/v1/departments`

Lists Zoho Desk departments (help-desk divisions). Useful for scoping ticket lists/searches by department, or reporting on which desks exist.

Rejects any query parameter not listed below with a 422 `UNPROCESSABLE_ENTITY` ("Extra query parameter '...' is present in the input.").

## Parameters

| Name | Required | Description |
|---|---|---|
| from | no | Starting index. |
| limit | no | Number of departments to return (1-100). |
| isEnabled | no | Filter to enabled (`true`) or disabled (`false`) departments. |

## Response

Single top-level key `data`: an array of department objects. No `count` field. Each department object includes: `id`, `name`, `description`, `createdTime`, `chatStatus`, `nameInCustomerPortal`, `creatorId`, `isEnabled`, `isDefault`, `isAssignToTeamEnabled`, `isVisibleInCustomerPortal`, `hasLogo`, `sanitizedName`.

## Errors

- `from` < 0 → 422 `UNPROCESSABLE_ENTITY` ("exceeds the range of '>=0'").
- Non-integer `limit` → 422 `UNPROCESSABLE_ENTITY` (datatype mismatch).
- No matching departments (e.g. `isEnabled=false` when none are disabled) → 204 No Content (empty body).

## Scopes

`Desk.settings.READ`

## Notes

- Read-only, no HITL gate.
