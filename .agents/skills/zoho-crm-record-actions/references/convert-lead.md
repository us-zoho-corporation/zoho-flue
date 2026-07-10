# Convert Lead

`POST /crm/v8/Leads/{id}/actions/convert`

Converts a CRM Lead into a Contact + Account, and optionally a Deal. Irreversible via the API — there is no operation that turns a converted Contact/Account/Deal back into a Lead.

A request body is required; `POST` with no body returns HTTP 400 (`{"code": "INVALID_DATA", "details": {"expected_data_type": "jsonobject"}, "message": "body", "status": "error"}`). The minimal valid body is `{"data": [{}]}`, which auto-creates both a Contact (from the Lead's name fields) and an Account (from the Lead's `Company` field) and creates no Deal.

## Parameters

| Name | Required | Description |
|---|---|---|
| lead_id | yes | The lead record ID |
| data | yes | Conversion options, sent as `{"data": [data]}`. `data` itself may be `{}` |

`data` may include:

| Key | Required | Description |
|---|---|---|
| `Accounts` | no | If omitted, an Account is auto-created from the Lead's `Company` field. If provided as `{"id": existing_account_id}`, links to that existing Account instead of creating one — an empty `{}` is rejected with `MANDATORY_NOT_FOUND` on `Accounts.id` |
| `Contacts` | no | Same pattern as `Accounts`: omit to auto-create from the Lead's name fields, or pass `{"id": existing_contact_id}` to link an existing Contact |
| `Deals` | no | Omit entirely to skip Deal creation (response's `Deals` key comes back `null`). To create a Deal, provide an object with mandatory fields `Deal_Name`, `Closing_Date`, and `Pipeline` (a valid Pipeline value for the org, e.g. `"Standard (Standard)"`) — `Stage` is also required in practice since it's mandatory on the Deals layout |
| `overwrite` | no | Boolean, accepted alongside the above keys |
| `notify_lead_owner` | no | Boolean, accepted alongside the above keys |
| `notify_new_entity_owner` | no | Boolean, accepted alongside the above keys |

## Response

HTTP 200 on success:

```json
{"data": [{"code": "SUCCESS", "message": "The record has been converted successfully", "status": "success",
  "details": {"Contacts": {"name": "...", "id": "..."}, "Accounts": {"name": "...", "id": "..."}, "Deals": null}}]}
```

`Deals` is `null` when no Deal was created, or `{"name": ..., "id": ...}` when one was.

After conversion, `GET /crm/v8/Leads/{id}` on the converted Lead returns HTTP 204 (no content) — the Lead is no longer retrievable as a Lead.

## Errors

| Condition | Response |
|---|---|
| No body | HTTP 400, `{"code": "INVALID_DATA", "details": {"expected_data_type": "jsonobject"}, "message": "body", "status": "error"}` |
| `Deals` given without `Deal_Name` / `Closing_Date` / `Pipeline` | HTTP 400, `{"data": [{"code": "MANDATORY_NOT_FOUND", "details": {"api_name": "<missing field>", "json_path": "..."}, "message": "required field not found", "status": "error"}]}` |
| Lead already converted | HTTP 400, `{"code": "ID_ALREADY_CONVERTED", "details": {...}, "message": "id already converted", "status": "error"}` |
| Invalid/nonexistent lead ID | HTTP 400, `{"code": "INVALID_DATA", "details": {...}, "message": "invalid data", "status": "error"}` |

## Scopes

`ZohoCRM.modules.leads.UPDATE`

## Notes

- Mutating and irreversible via the API — requires HITL approval. Decision options: approve / edit / reject / respond.
- This is a Leads-only endpoint — `module` is fixed to `Leads`, not a generic module parameter.
- The resulting Contact and Account are ordinary records afterward and can be deleted like any other record if the conversion needs to be undone manually; a Deal created during conversion can likewise be deleted. There is no way to restore the original Lead.
