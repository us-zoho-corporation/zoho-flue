# Reorder Workflow Rules

`PUT /crm/v8/settings/automation/workflow_rules`

Sets the execution order of a module's workflow rules.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name. Not sent to Zoho — rule IDs are already unambiguous — but identifies which module's rules are being reordered |
| ordered_rule_ids | yes | Workflow rule IDs in the desired execution order |

## Flow

There is no `/actions/reorder` endpoint, and this `PUT` takes no query parameters. The `workflow_rules` array is capped at 1 item — a 2-item array is rejected with `INVALID_DATA` ("maximum_length": 1) before touching any rule — so each rule gets its own `PUT` call: for each `rule_id` at position `i` in `ordered_rule_ids`, `PUT /crm/v8/settings/automation/workflow_rules` with body `{"workflow_rules": [{"id": rule_id, "sequence_number": i + 1}]}`. An invalid `id` returns `INVALID_DATA` / "the id given seems to be invalid".

## Scopes

`ZohoCRM.settings.workflow_rules.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Issues one HTTP call per rule ID, not a single bulk request.
- Changes the execution order of an org's real, currently-firing automation rules — capture the current `ordered_rule_ids` before executing so it can be restored if needed; there is no built-in undo.
