# List Records

`GET /crm/v8/{module}`

Lists CRM records from a module, sorted by `id` descending by default. Use for browsing a module; it does not support server-side field filtering — use Search Records or COQL (`zoho-crm-query`) for that.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name (e.g. Deals, Contacts, Leads, or a custom module) |
| fields | **yes** | Comma-separated field list to restrict the response to. Omitting it fails with a 400 (`REQUIRED_PARAM_MISSING: fields`) |
| per_page | no | Records per page. Default and max are both 200 — values above 200 are silently capped to 200, not rejected |
| page | no | Page number, 1-indexed |
| sort_by | no | One of `id`, `Created_Time`, `Modified_Time` — any other field name fails with a 400 (`INVALID_DATA: This field is not supported in sorting`). Defaults to `id` if omitted |
| sort_order | no | `asc` or `desc`. Defaults to `desc` |

## Scopes

`ZohoCRM.modules.READ`

## Notes

- Read-only, no HITL approval required.
- The `criteria` query param is silently ignored on this endpoint — passing it has no filtering effect. Use Search Records (`references/search-records.md`) for field-based filters.
- Response includes an `info` object (`{count, page, per_page, sort_by, sort_order, more_records}`, plus `next_page_token`/`previous_page_token`/`page_token_expiry` for token-based paging past page-number limits). `more_records: true` means another page exists — fetch it by incrementing `page`; there is no server-side "fetch everything" mode.
