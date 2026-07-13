# List Contacts

`GET /api/v1/contacts`

Lists Desk contacts, paginated. Use Search Contacts instead for lookups by name/email.

## Parameters

| Name | Required | Description |
|---|---|---|
| from | no | Starting index, 1-indexed (`from=0` and `from=1` both return the first record). |
| limit | no | Number of contacts to return, range 1-100. Out-of-range values return `422 UNPROCESSABLE_ENTITY`. |
| sortBy | no | `lastName` \| `createdTime`. Prefix with `-` for descending. An unrecognized value returns `422 UNPROCESSABLE_ENTITY`. |
| viewId | no | Optional saved view id. A nonexistent id returns `422 INVALID_DATA` (`Invalid View Id`). |

## Scopes

`Desk.contacts.READ`

## Notes

- Read-only, no HITL gate.
- Response is `{"data": [...]}`, an array of contact objects — no `count` field. Fields include `id`, `firstName`, `lastName`, `email`, `secondaryEmail`, `phone`, `mobile`, `accountId`, `accountCount`, `ownerId`, `createdTime`, `isEndUser`, `isSpam`, `webUrl`, `customerHappiness`, etc. Does not include `account`, `owner`, `customFields`, or `layoutDetails` — use Get Contact for those.
- If no contacts match the given `from`/pagination window, the API returns `204 No Content` with an empty body rather than `200` with an empty array.
