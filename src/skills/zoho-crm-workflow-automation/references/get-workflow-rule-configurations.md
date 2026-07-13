# Get Workflow Rule Configurations

`GET /crm/v8/settings/automation/workflow_rules?module=&page=&per_page=`
`GET /crm/v8/settings/automation/workflow_rules/{workflow_rule_id}`

Lists workflow rules for a module, or finds one rule's full configuration by ID.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | no | Filter to workflow rules for this module |
| page | no | Page number, default 1 |
| per_page | no | Rows per page, default/max 200 |
| workflow_rule_id | no | Get one specific workflow rule's full configuration by ID — uses the per-ID path, not a query param (a `workflow_rule_id` query param on the collection path returns `INVALID_REQUEST`) |

The collection GET (no `workflow_rule_id`) returns summary fields only (no `conditions`). The per-ID GET returns the full configuration including `conditions[]` with criteria and actions.

## Scopes

No static scope declared on this tool — Zoho exposes only `ZohoCRM.settings.workflow_rules.ALL` (no separate READ variant), so the write scope covers this call too.

## Notes

- Read-only, no HITL approval required.
- The per-ID path exists (`/crm/v8/settings/automation/workflow_rules/{id}`) and returns a single-element `workflow_rules` array. An id that doesn't exist in the org returns `204 No Content` (empty body), not a 404 or error payload.
- When `workflow_rule_id` is omitted, the collection GET returns the full list of rules for the given `module` (or all modules if `module` is also omitted), paginated via `page`/`per_page`.
