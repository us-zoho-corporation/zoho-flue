# Get Module Detail

`GET /crm/v8/settings/modules/{module}`

Gets metadata for one specific CRM module. `{module}` accepts either the API name (e.g. `Deals`) or the numeric module ID. Response shape is the same module object as [List Modules](list-modules.md) (profiles, `api_name`, `generated_type`, `display_field`, etc.), plus a handful of extra keys (`custom_view`, `related_list_properties`, `search_layout_fields`, `lookup_field_properties`, `$properties`, `$field_states`, `territory`, ...). It does **not** include the module's field list or layouts — use [Get Fields](get-fields.md) for fields.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | The module API name or ID |

## Response

`{"modules": [{...}]}` — a one-element array even though the request is for a single module.

## Scopes

`ZohoCRM.settings.modules.READ`

## Notes

- Read-only, no HITL approval required.
- Returns 204 (empty body) if the module API name/ID doesn't exist.
