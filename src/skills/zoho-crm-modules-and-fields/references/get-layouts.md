# Get Layouts

`GET /crm/v8/settings/layouts?module={module}`

Gets all layouts for a module (or one, at `/settings/layouts/{layout_id}?module={module}`) — each with its `id` (the `layout_id` other operations need, e.g. [Get Pipelines](get-pipelines.md)) and its `sections[].fields[]`, which — unlike [Get Fields](get-fields.md) — carry **layout-scoped** picklist values and mandatory status.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |

## Response

`{"layouts": [{"id": ..., "name": ..., "sections": [{"fields": [...]}], ...}]}`

## Scopes

`ZohoCRM.settings.layouts.READ`

## Notes

- Read-only, no HITL approval required.
- [Get Fields](get-fields.md) explicitly does **not** return layout-specific picklist values or mandatory-ness — this is the operation that does. Use this before creating/updating a record with any picklist-type field, so the value you send is one the org actually configured, not a guess.
- For the Deals module specifically, `Pipeline` and `Stage` need one more step: this only gets you the `layout_id`, not the pipeline's valid stages — see [Get Pipelines](get-pipelines.md).
