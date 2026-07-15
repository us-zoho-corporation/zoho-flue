# Get Fields

`GET /crm/v8/settings/fields?module={module}`

Gets field definitions for a CRM module — API names, labels, data types, picklist values, mandatory status, and lookup configuration.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | The module API name (e.g. Deals, Contacts) |

`module` is mandatory: omitting it (or passing an empty string) 400s with `REQUIRED_PARAM_MISSING`. An unknown module name 400s with `INVALID_MODULE`.

## Response

`{"fields": [{...}, ...]}`. A standard module (e.g. Deals) returns ~30 fields covering both system and custom fields. **Does not include layout-specific details — mandatory status or picklist values** (Zoho's own doc is explicit about this); use [Get Layouts](get-layouts.md) for those.

## Scopes

`ZohoCRM.settings.fields.READ`

## Notes

- Read-only, no HITL approval required.
- Use before creating a field to check whether a field with the same label already exists — Zoho errors on duplicate field labels (`DUPLICATE_DATA`) rather than silently no-op'ing. See [Create Field](create-field.md).
- Do **not** use this to find a picklist field's valid values (e.g. before creating/updating a record) — its response isn't layout-scoped, so it won't reflect what a specific layout actually allows. Use [Get Layouts](get-layouts.md) instead.
