# Batch Create

`POST /crm/v8/{module}`

Creates multiple CRM records in a single API call. Same endpoint as Create Record in the `zoho-crm-records` skill; the request body carries an array of records instead of one.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| records | yes | Array of record objects, each with field-value pairs. Max 100 per call — exceeding it rejects the entire call with a 400 (`INVALID_DATA`, `details.maximum_length: 100`); none of the records are created |

Request body: `{"data": records}`.

## Scopes

`ZohoCRM.modules.{module}.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Re-running a batch_create with the same data fails on duplicate-value constraints (no idempotency). Prefer [Upsert](upsert.md) when the operation might re-run.
