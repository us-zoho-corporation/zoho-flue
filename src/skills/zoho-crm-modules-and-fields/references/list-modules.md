# List Modules

`GET /crm/v8/settings/modules`

Lists all available CRM modules (system + custom): API names, labels, editable/visible flags, and whether each module is custom (`generated_type` is `custom` for user-created modules; `default`, `field_tracker`, or `subform` for built-in ones). Use to find the exact API name of a custom module before managing its fields or creating records.

## Parameters

None.

## Response

`{"modules": [{...}, ...]}`.

## Scopes

`ZohoCRM.settings.modules.READ`

## Notes

- Read-only, no HITL approval required.
