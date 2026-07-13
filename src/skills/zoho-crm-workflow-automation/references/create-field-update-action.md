# Create Field Update Action

`POST /crm/v8/settings/automation/field_updates`

Creates a Field Update associative action — sets ONE field's value on a record when a Workflow Rule fires it.

## Parameters

Request body: `{"field_updates": [{...}]}`. The array holds exactly one action — see Behavior.

| Name | Required | Description |
|---|---|---|
| name | yes | Action name |
| module | yes | `{api_name, id}` — the CRM module the action targets. `id` is mandatory; omitting `module` entirely returns `MANDATORY_NOT_FOUND` |
| field | yes | `{api_name, id}` — the target field. `id` is mandatory; omitting `field` returns `MANDATORY_NOT_FOUND` / "please specify fieldId and fieldName" |
| value | no | The value to set on `field` when the action fires. Omitting it creates the action with `value: null` (no error) |
| update_type | no | `append`/`remove`/`replace` — only meaningful for multiselect fields |

Look up `module.id` and `field.id` from `GET /crm/v8/settings/fields?module=<module>` (field metadata) before calling — this endpoint does not resolve names to ids itself.

## Behavior

- Only **one field update per API call** is honored: if the `field_updates` array has more than one item, Zoho creates only the **first** item and silently drops the rest — no error, and the response `details.id` reflects only the created (first) item. Send one `POST` per field update.
- `type` (`"static"`) and `feature_type` (`"workflow"`) are not required in the request — Zoho defaults both automatically on create.
- For picklist/multiselect fields, an invalid `value` is rejected by Zoho with `INVALID_DATA` / "the value given seems to be invalid" — this message does not list the valid options. Call `GET /crm/v8/settings/fields?module=<module>` first and check the field's `pick_list_values[].actual_value` to get real option values before setting `value`.

No `?module=` query param is sent — a stray query param trips Zoho's "verify your parameter values" 400 (`INVALID_REQUEST`).

## Scopes

`ZohoCRM.settings.automation_actions.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- `GET /crm/v8/settings/automation/field_updates/{id}` and `DELETE /crm/v8/settings/automation/field_updates/{id}` both work for reading back and deleting a created action.
