# List Accounts

`GET /api/v1/accounts`

Lists Desk accounts (customer companies), paginated.

## Parameters

| Name | Required | Description |
|---|---|---|
| from | no | Starting index. |
| limit | no | Number of accounts to return, 1-100. Values outside this range return a 422 `UNPROCESSABLE_ENTITY` (including `limit=0`). |
| sortBy | no | `accountName` \| `createdTime`. Prefix with `-` for descending. Any other value returns a 422 `UNPROCESSABLE_ENTITY`. |
| viewId | no | Saved view id. An unknown/invalid id returns a 422 `INVALID_DATA` error. |
| fields | no | Comma-separated field names to include in each account object, in addition to `id`. |

## Response

```json
{
  "data": [
    {
      "id": "1289132000000397280",
      "accountName": "Zoho",
      "email": "support@zohodesk.com",
      "website": "https://www.zoho.com/",
      "phone": "1 888 900 9646",
      "createdTime": "2026-03-11T19:21:19.000Z",
      "zohoCRMAccount": null,
      "webUrl": "https://desk.zoho.com/support/.../ShowHomePage.do#Accounts/dv/1289132000000397280",
      "customerHappiness": {"badPercentage": "0", "okPercentage": "0", "goodPercentage": "0"}
    }
  ]
}
```

Account objects in this list are a reduced shape — no `owner`, `industry`, or address fields (`street`/`city`/`state`/`country`/`code`), unlike Get Account and Search Accounts. Use `fields` to request specific fields; `id` is always present. There is no top-level `count`. If `from` is past the end of the result set, the response is a 204 with an empty body (not an empty `data` array).

## Scopes

`Desk.basic.READ`

## Notes

- Read-only, no HITL gate.
