# Associate Action to Workflow

`PUT /crm/v8/settings/automation/workflow_rules`

Attaches an existing associative action (field update, email notification, task, webhook) — or an existing Deluge function — to a Workflow Rule's instant or scheduled actions.

## Parameters

| Name | Required | Description |
|---|---|---|
| workflow_rule_id | yes | The Workflow Rule ID to attach the action to |
| condition_id | yes | The target condition's own `id` (from the rule's `conditions[]`, via [Get Workflow Rule Configurations](get-workflow-rule-configurations.md) per-ID GET) — Zoho's `PUT` addresses a condition by its id, not by the rule id alone. An unrecognized `condition_id` for the given rule returns `INVALID_DATA` / "This given conditionid seems to be invalid" |
| action_type | yes | One of `field_updates`, `email_notifications`, `tasks`, `webhooks`, `functions` (plural, not singular `"function"`) |
| action_id | yes | ID of an existing associative action, or existing Deluge function when `action_type == "functions"`. The action-reference object is always `{"id": action_id, "type": action_type}` regardless of type — there is no separate `function_id` key for functions. Omitting `id` returns `DEPENDENT_FIELD_MISSING`. This tool never creates a function — Deluge function code authoring is UI-only (Setup > Developer Hub > Functions) |
| when | no | `"instant"` (default) or `"scheduled"` |
| execute_after | conditional | Required when `when == "scheduled"`: `{"period": "days", "unit": 1}`-style delay group. Ignored for instant actions |

## Behavior

Zoho has no dedicated "attach action" endpoint. Association is done by re-`PUT`ting the rule's target condition with the full action reference list, including the action being attached:

1. `GET` the rule via the per-ID path in [Get Workflow Rule Configurations](get-workflow-rule-configurations.md) to read its current `conditions[]` (specifically the target condition's `id` and its existing `instant_actions.actions[]` / `scheduled_actions[]`).
2. Actions live inside `conditions[].instant_actions.actions[]` (instant) or `conditions[].scheduled_actions[].actions[]` (scheduled) — NOT as top-level keys on the rule.
3. Zoho replaces the actions array wholesale with whatever is sent — it does not merge. The caller must fetch the existing action list first and include it alongside the new action in the same `PUT`, or the prior actions are dropped from that condition.
4. For scheduled actions, group by `execute_after`: reuse a matching group's `actions` array if one exists for that delay, otherwise add a new `{execute_after, actions}` group.
5. `PUT /crm/v8/settings/automation/workflow_rules` with body `{"workflow_rules": [{"id": workflow_rule_id, "conditions": [{"id": condition_id, "instant_actions": {"actions": [...]}}]}]}` (or `scheduled_actions` for the scheduled case). No query parameters.

Rules with more than one condition are not specifically rejected by Zoho at this endpoint — the request just needs the correct `condition_id` for whichever condition should get the new action; Zoho errors only if that id doesn't belong to the rule.

## Scopes

`ZohoCRM.settings.workflow_rules.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
