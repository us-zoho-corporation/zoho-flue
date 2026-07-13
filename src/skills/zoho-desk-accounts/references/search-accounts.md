# Search Accounts

`GET /api/v1/accounts/search`

Searches Desk accounts. Matching is whole-value and case-insensitive, not substring: a bare term (e.g. `oho`) only hits if it equals a field's entire value. A trailing or leading `*` anchors a prefix or suffix match (`Zoho*`, `*Zoho`), but `*` on both sides (`*oho*`) does not do a general substring match and returns no results. `accountName` matches only that field; `_all` matches the same way across `accountName`, `email`, `city`, and other account fields. If no search parameters are given, the endpoint returns all accounts (equivalent to List Accounts with no filters).

## Parameters

| Name | Required | Description |
|---|---|---|
| accountName | no | Match against account name. Exact value, or prefix/suffix with a single `*`. |
| id | no | Exact account id. |
| _all | no | Match across all searchable columns, same exact/prefix/suffix semantics as `accountName`. |
| createdTimeRange | no | ISO range, format `from,to`. |
| modifiedTimeRange | no | ISO range, format `from,to`. |
| limit | no | 1-100; values outside this range return a 422 `UNPROCESSABLE_ENTITY`. |
| from | no | Starting index, 0-4999; values outside this range return a 422 `UNPROCESSABLE_ENTITY`. |
| sortBy | no | `relevance` \| `modifiedTime` \| `createdTime` \| `accountName`. |

## Response

On a match, `{"data": [...], "count": <int>}` — `count` reflects the number of items in `data` returned by this call, not the total match count. Each account object in `data` includes an embedded `owner` block (`id`, `firstName`, `lastName`, `emailId`, `photoURL`, `zuid`) plus the full field set (address, `industry`, `annualrevenue`, etc.) — the same superset shape as Get Account, unlike the reduced List Accounts shape.

On zero matches, the response is a 204 with an empty body (not an empty `data` array).

## Scopes

`Desk.search.READ`, `Desk.basic.READ`

## Notes

- Read-only, no HITL gate.
