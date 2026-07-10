# Upsert

`POST /crm/v8/{module}/upsert`

Creates new records and updates existing ones based on `duplicate_check_fields`, up to 100 records per call. Per record, the response has `"code": "SUCCESS"` regardless of insert or update — check `action` (`"insert"` or `"update"`) to tell them apart, and `duplicate_field` for which field matched an existing record (`null` on insert). Failures use other `code` values (e.g. `INVALID_DATA`, `MANDATORY_NOT_FOUND`). Prefer this over Batch Create whenever the operation might re-run, or when the user has configured uniqueness constraints.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| records | yes | Array of record objects, each with field-value pairs. Max 100 per call |
| duplicate_check_fields | no | Field API names to use for duplicate detection. When omitted, Zoho falls back to module defaults (e.g. Email for Contacts/Leads, Account_Name for Accounts) |

Request body: `{"data": records}`, plus `"duplicate_check_fields": [...]` when provided.

## Scopes

`ZohoCRM.modules.{module}.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- **Not supported on every module.** Activity-style modules — Tasks, Events, Notes, Calls, Activities — reject `/upsert` with a 400 (`INVALID_DATA: the given module is not supported for this api`). Use [Batch Create](batch-create.md) for those instead.
