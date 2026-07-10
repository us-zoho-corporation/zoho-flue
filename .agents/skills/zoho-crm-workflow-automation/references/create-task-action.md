# Create Task Action

`POST /crm/v8/settings/automation/tasks`

Creates an Automation Task associative action — auto-creates a follow-up task when a Workflow Rule fires it.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | `{api_name, id}` — the CRM module whose record triggers task creation. Omitting it returns `MANDATORY_NOT_FOUND` |
| name | yes | Action name |
| field_mappings | yes | Array of `{field: {api_name, id}, type, value}` items against the Tasks module's own fields. `Subject` and `Due_Date` mappings are both mandatory — omitting either returns `REQUIRED_DATA_NOT_FOUND` naming the missing field |

Look up each field's `id` (and the `module.id`) from `GET /crm/v8/settings/fields?module=<module>` first — this endpoint does not resolve names to ids itself. `field` must be the `{api_name, id}` object; a bare string is rejected with `INVALID_DATA` / "data type not supported".

## Behavior

- There are no flat "subject"/"due date" top-level keys — every value is set through `field_mappings`.
- `Subject` (and any other plain-text mapping) uses `type: "static"` with a literal string `value`.
- `Due_Date` cannot take a `static` literal value — Zoho rejects it with `DEPENDENT_MISMATCH`. It requires `type: "execution_time"` with `value` shaped `{"period": "days", "unit": "<n>", "trigger_field": "${CURRENTTIME}", "sign": "plus"|"minus"}` (relative to the triggering record's time). `unit` is a string, not a number. Other valid `trigger_field` values include a field-reference form, e.g. `${!Tasks.Remind_At}` (relative to another field on the record). To find the right shape for a different `trigger_field`/`sign` combination, inspect an existing action's `field_mappings` via `GET /crm/v8/settings/automation/tasks`.
- `merge_field` is also a valid `type` for record-field interpolation.

Request body: `{"tasks": [{"module": {api_name, id}, "name": name, "field_mappings": [...]}]}`. `feature_type` (`"workflow"`) defaults automatically — it does not need to be sent.

## Scopes

`ZohoCRM.settings.automation_actions.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- `GET /crm/v8/settings/automation/tasks/{id}` and `DELETE /crm/v8/settings/automation/tasks/{id}` both work for reading back and deleting a created action. `GET /crm/v8/settings/automation/tasks` without a `module` filter returns tasks actions across all modules.
