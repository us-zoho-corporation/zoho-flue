# Search Contacts

`GET /api/v1/contacts/search`

Searches Desk contacts. All fields are optional; omitting every field returns all contacts (same as List Contacts, but with a richer response shape — see Notes).

## Parameters

| Name | Required | Description |
|---|---|---|
| firstName | no | Case-insensitive substring match. Minimum 3 characters. |
| lastName | no | Case-insensitive exact match (not substring). Minimum 3 characters. |
| fullName | no | Case-insensitive substring match. Minimum 3 characters. |
| email | no | Case-insensitive substring match (matches anywhere in the address, including before the `@`). Minimum 3 characters. |
| phone | no | Substring match. Minimum 3 characters. |
| mobile | no | Substring match. Minimum 3 characters. |
| accountName | no | Case-insensitive exact match (not substring). Minimum 3 characters. |
| _all | no | Case-insensitive substring match across contact columns. Minimum 3 characters. |
| limit | no | 1-100. Out-of-range values return `422 UNPROCESSABLE_ENTITY`. |
| from | no | Starting index, 0-4999 (0-indexed, unlike List Contacts' `from`). Values above 4999 return `422 UNPROCESSABLE_ENTITY` ("exceeds the range of '0-4999'"); `from=4999` itself returns `422` ("Max search result iterable is 5000"). |
| sortBy | no | `relevance` \| `modifiedTime` \| `createdTime` \| `lastName` \| `firstName`. An unrecognized value returns `422 UNPROCESSABLE_ENTITY`. |

Any of `firstName`, `lastName`, `fullName`, `email`, `phone`, `mobile`, `accountName`, `_all` shorter than 3 characters returns `422 UNPROCESSABLE_ENTITY` ("is less than the specified minimum length of '3'"), naming the offending field.

## Scopes

`Desk.search.READ`, `Desk.contacts.READ`

## Notes

- Read-only, no HITL gate.
- Response is `{"data": [...], "count": N}`. Each object in `data` includes the List Contacts fields plus `customFields`, `cf`, `layoutId`, city/country/state/street/zip, `title`, `description`, `language`, an `owner` object (agent id/name/email/photoURL), and an `account` object (id/accountName/website) when the contact has one.
- No matches returns `204 No Content` with an empty body, not `200` with an empty array or `count: 0`.
