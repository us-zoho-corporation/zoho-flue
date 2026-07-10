# Create Workflow Rule

`POST /crm/v8/settings/automation/workflow_rules`

Creates a Workflow Rule — fires instant or scheduled actions when records in a module are created, edited, or match criteria. Create the associative actions first ([Create Field Update Action](create-field-update-action.md), [Create Task Action](create-task-action.md), [Create Webhook Action](create-webhook-action.md)), or attach them afterward with [Associate Action to Workflow](associate-action-to-workflow.md).

Request body: `{"workflow_rules": [{...}]}`, one rule per call.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | `{api_name}` — CRM module the rule triggers on. `id` is not required here (unlike `field_updates`/`tasks`/`webhooks` module refs) |
| name | yes | Workflow rule name |
| execute_when | yes | `{type: <trigger>, details: {...}}` — see below |
| conditions | yes | Array of condition objects carrying criteria and actions — see below |

### `execute_when` and `conditions` shape

- `execute_when.type` — one of `create`, `edit`, `create_or_edit`, `delete`, `field_update`, `rollup_summary_update`, `section_update`, `date_or_datetime`, `score_increase`, `score_update`, `score_decrease`, `recommendation` for record-action triggers (Calls, Appointments, Emails, and social-media triggers have their own vocab — see Zoho CRM API v8 Configure Workflow Rule docs). An unrecognized value is rejected with `INVALID_DATA` / "The given trigger is not valid".
- `execute_when.details` — identifies the trigger source. `trigger_module` may be omitted entirely; Zoho fills in `{api_name, id}` for the rule's own `module` automatically. Supply `details.trigger_module` explicitly only for a related-module trigger (e.g. Emails/Notes triggering off a parent module).
- `conditions` — array of `{sequence_number, criteria_details: {criteria: {...} or null}, instant_actions: {actions: [{id, type}, ...]}, scheduled_actions: [{execute_after: {period, unit}, actions: [{id, type}, ...]}]}`.
  - `criteria_details` itself is mandatory — Zoho rejects a missing or bare `null` `criteria_details` with `MANDATORY_NOT_FOUND` / "please specify criteria details". To match all records with no extra filter, send `criteria_details: {"criteria": null}` explicitly (not `null` on its own).
  - Actions live INSIDE each condition, never at the top level of the rule.
  - Action `type` values are the plural collection names: `field_updates`, `email_notifications`, `tasks`, `webhooks`, `functions`. The action-reference object is always `{"id": <action id>, "type": <one of the above>}` — this is true for `functions` too (there is no separate `function_id` key; omitting `id` returns `DEPENDENT_FIELD_MISSING`).
  - Reference only EXISTING action IDs (from the create-action tools, or created in the Zoho UI for `email_notifications`/`functions`) — never fabricate an id; an invalid id returns `INVALID_DATA` / "This given actionid seems to be invalid". A rule must run at least one action: populate a condition's `instant_actions`/`scheduled_actions` with a real action id here, or create the rule with empty actions and attach one immediately after via [Associate Action to Workflow](associate-action-to-workflow.md). A rule with only empty/absent action arrays is rejected by Zoho with `MANDATORY_NOT_FOUND` / "Actions cannot be empty".

No `?module=` query param is sent — a stray query param trips Zoho's "verify your parameter values" 400 (`INVALID_REQUEST`).

**Rules cannot be created inactive.** Passing `status: {"active": false}` in the create body is rejected with `INVALID_DATA` / "Can not create inactive rule" — every newly created rule starts active. To disable a rule, `PUT` it afterward with `{"workflow_rules": [{"id": <id>, "status": {"active": false}}]}`.

## Scopes

`ZohoCRM.settings.workflow_rules.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- `DELETE /crm/v8/settings/automation/workflow_rules/{id}` deletes a rule.
