# Delete All Records

`GET /crm/v8/{module}` or `GET /crm/v8/{module}/search` (list IDs, paginated) then `DELETE /crm/v8/{module}?ids=` (batched)

Deletes every record in a module, or every record matching a criteria filter. Handles pagination on the list side and batching (100 IDs per DELETE call) on the delete side.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| criteria | no | Optional criteria filter, e.g. `(Stage:equals:Closed Lost)`. Omit to delete all records in the module |

## Flow

1. If `criteria` is given, list IDs via `GET /crm/v8/{module}/search?criteria=...&fields=id&per_page=200&page=N` — the plain list endpoint (`GET /crm/v8/{module}`) silently ignores `criteria`, so using it there would collect and delete every record in the module instead of the filtered subset. Without `criteria`, use the plain list endpoint: `GET /crm/v8/{module}?fields=id&per_page=200&page=N`.
2. Repeat with incrementing `page` until `info.more_records` is `false` (or a 204 is returned, for the search endpoint), collecting all matching record IDs.
3. For each chunk of up to 100 IDs: `DELETE /crm/v8/{module}?ids=id1,id2,...`.
4. Summarize results per chunk (each chunk's response is an array of per-record `code`/`status`); report failures individually rather than assuming the whole chunk succeeded.

## Scopes

`ZohoCRM.modules.{module}.DELETE` (and `ZohoCRM.modules.READ` for the listing step)

## Notes

- Mutating and destructive — requires HITL approval. Decision options restricted to approve / reject (no edit).
- Irreversible at scale — there is no dry-run; review `criteria` carefully before approving, and double-check it against the search endpoint (not the plain list endpoint) since only the former actually applies it.
