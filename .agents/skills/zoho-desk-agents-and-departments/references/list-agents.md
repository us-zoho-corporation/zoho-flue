# List Agents

`GET /api/v1/agents`

Lists Zoho Desk support agents. Use to find who to assign or reassign a ticket to, or to report on the support team. Also used internally to populate the live assignee dropdown on the Update Ticket approval card.

Rejects any query parameter not listed below with a 422 `UNPROCESSABLE_ENTITY` ("Extra query parameter '...' is present in the input.").

## Parameters

| Name | Required | Description |
|---|---|---|
| from | no | Starting index. |
| limit | no | Number of agents to return (1-100). |
| status | no | Filter by agent status. Known valid values: `ACTIVE`, `DISABLED`, `DELETED`. |
| departmentId | no | Filter to agents associated with a department id. |

`searchStr` is not a supported parameter here — passing it returns 204 No Content regardless of value.

## Response

Single top-level key `data`: an array of agent objects. No `count` field. Each agent object includes at least: `id`, `zuid`, `name`, `firstName`, `lastName`, `emailId`, `status`, `isConfirmed`, `roleId`, `profileId`, `rolePermissionType`, `associatedDepartmentIds`, `associatedChatDepartmentIds`, `phone`, `mobile`, `aboutInfo`, `extn`, `countryCode`, `langCode`, `timeZone`, `photoURL`, `channelExpert`, `cf`, `isZiaAgent`.

## Errors

- `from` < 0 → 422 `UNPROCESSABLE_ENTITY` ("exceeds the range of '>=0'").
- Non-integer `limit` → 422 `UNPROCESSABLE_ENTITY` (datatype mismatch).
- No matching agents (e.g. `status=DISABLED` when none are disabled) → 204 No Content (empty body).

## Scopes

`Desk.basic.READ`

## Notes

- Read-only, no HITL gate.
