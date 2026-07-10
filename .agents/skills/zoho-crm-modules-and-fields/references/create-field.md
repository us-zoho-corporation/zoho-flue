# Create Field

`POST /crm/v8/settings/fields?module={module}`

Creates a custom field on a CRM module (admin Settings API).

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | Module API name to add the field to (e.g. Deals, PSE_Concierge), passed as a query param. Omitting it 400s with `REQUIRED_PARAM_MISSING`. |
| label | yes | Display label for the new field (e.g. "Source Meeting ID") — sent as `field_label` |
| data_type | yes | Zoho field data type. Common values: `text` (single-line), `textarea` (multi-line), `integer`, `decimal`, `currency`, `date`, `datetime`, `boolean`, `picklist`, `multi_picklist`, `lookup`, `email`, `phone`, `url`, `autonumber`. An unrecognized value 400s with `INVALID_DATA` on `data_type`. |
| options | no | Type-specific field options, merged into the field body. Picklist: `{"pick_list_values": [{"display_value": "Foo"}]}`. Lookup: `{"lookup": {"module": {"api_name": "Contacts"}, "display_label": "..."}}` — `lookup.display_label` is mandatory for lookup fields (Zoho 400s with `MANDATORY_NOT_FOUND` without it). Text: optional `{"length": 255}` |

Request body: `{"fields": [{"field_label": label, "data_type": data_type, ...options}]}`.

## Response

`201` with `{"fields": [{"code": "SUCCESS", "details": {"id": "<field_id>"}, "message": "field created", "status": "success"}]}`.

## Scopes

`ZohoCRM.settings.fields.ALL`

## Notes

- Mutating — requires HITL approval.
- Idempotency is the caller's responsibility: call [Get Fields](get-fields.md) first and skip creation if a field with the same label already exists — Zoho 400s with `DUPLICATE_DATA` on a duplicate field label rather than silently no-op'ing.
- Admin access required on the Zoho org.
- `DELETE /crm/v8/settings/fields/{field_id}?module={module}` deletes a custom field, returning `200` with `{"fields": [{"code": "SUCCESS", "details": {"id": "<field_id>"}, "message": "field deleted", "status": "success"}]}`.
