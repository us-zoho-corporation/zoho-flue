# Get Contact

`GET /api/v1/contacts/{id}`

Fetches a single Desk contact by id.

## Parameters

| Name | Required | Description |
|---|---|---|
| id | yes | Contact id (path parameter). |
| include | no | Side-load related data, e.g. `accounts`. An unrecognized value returns `422 UNPROCESSABLE_ENTITY`. |

## Scopes

`Desk.contacts.READ`

## Notes

- Read-only, no HITL gate.
- Response includes more fields than List Contacts: `layoutId`, `layoutDetails`, `customFields`, `cf`, `city`/`country`/`state`/`street`/`zip`, `description`, `title`, `language`, `isFollowing`, `isDeleted`, `isTrashed`, in addition to the fields returned by List Contacts.
- `include=accounts` adds an `account` object (`id`, `accountName`, `website`) for the contact's primary account.
- A nonexistent or malformed id returns `404 URL_NOT_FOUND` (`The URL you requested could not be found.`).
