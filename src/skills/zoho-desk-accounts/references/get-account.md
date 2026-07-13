# Get Account

`GET /api/v1/accounts/{id}`

Fetches a single Desk account by id.

## Parameters

| Name | Required | Description |
|---|---|---|
| id | yes | Account id (path parameter). |
| include | no | Single side-load value, `owner`, to add the `owner` block (`id`, `firstName`, `lastName`) to the response. Any other value returns a 422 `UNPROCESSABLE_ENTITY`; comma-separated lists are not accepted. |

## Response

Full account object, including address fields (`street`, `city`, `state`, `country`, `code`), `industry`, `annualrevenue`, `description`, `fax`, `ownerId`, `layoutId`/`layoutDetails`, `customFields`/`cf`, `isFollowing`, `isDeleted`, `isTrashed`, `associatedSLAIds`, `zohoCRMAccount`, `webUrl`, and `createdTime`/`modifiedTime`. This is a superset of the List Accounts shape.

## Errors

- Well-formed but nonexistent numeric id: 403 `FORBIDDEN` ("You are not authorized to access this resource."), not 404.
- Non-numeric id: 404 `URL_NOT_FOUND`.

## Scopes

`Desk.basic.READ`

## Notes

- Read-only, no HITL gate.
