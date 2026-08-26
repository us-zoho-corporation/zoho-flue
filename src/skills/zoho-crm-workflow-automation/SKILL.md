---
name: zoho-crm-workflow-automation
description: Create and manage Zoho CRM Workflow Rules and their associative actions (field updates, tasks, webhooks) — the process automation normally built by hand in Setup > Automation. Use when an agent needs to set up or inspect trigger-based automation on CRM records, e.g. "create a workflow rule that emails me when a deal closes", "list workflow rules for Deals", "add a field-update action to this rule". Does not cover Blueprint (see zoho-crm-blueprints) or Deluge function authoring (UI-only).
---

Workflow Rules fire instant or scheduled actions when records in a module are created, edited, or match criteria — process automation an admin would otherwise build by hand in Setup > Automation. This skill covers creating/listing/reordering rules, creating the associative actions a rule can fire (field updates, tasks, webhooks), and attaching an existing action to a rule.

Deluge function *code* authoring has no public API (Setup > Developer Hub is UI-only) — these operations can only reference an existing function by ID, never create one. Email Notification actions are the same: no create endpoint exists; create them in the Zoho UI, then attach by ID.

**Blueprint is a separate skill.** A Blueprint is a distinct multi-step states/transitions/connections flow — see `zoho-crm-blueprints` for reading a record's next transition, advancing it, and configuring Blueprint states/transitions.

## Operations

| Operation | Method | Description |
|---|---|---|
| [Create Workflow Rule](references/create-workflow-rule.md) | `POST /crm/v8/settings/automation/workflow_rules` | Create a trigger + criteria + actions rule |
| [Get Workflow Rule Configurations](references/get-workflow-rule-configurations.md) | `GET /crm/v8/settings/automation/workflow_rules(/{id})` | List rules, or find one rule's full config by ID |
| [Reorder Workflow Rules](references/reorder-workflow-rules.md) | `PUT /crm/v8/settings/automation/workflow_rules` | Set the execution order of a module's rules |
| [Create Field Update Action](references/create-field-update-action.md) | `POST /crm/v8/settings/automation/field_updates` | Create an action that sets one field's value when fired |
| [Create Task Action](references/create-task-action.md) | `POST /crm/v8/settings/automation/tasks` | Create an action that auto-creates a follow-up task when fired |
| [Create Webhook Action](references/create-webhook-action.md) | `POST /crm/v8/settings/automation/webhooks` | Create an action that calls an external URL when fired |
| [Associate Action to Workflow](references/associate-action-to-workflow.md) | `PUT /crm/v8/settings/automation/workflow_rules` | Attach an existing action (or Deluge function) to a rule |

Each action/rule type also supports `DELETE /crm/v8/settings/automation/<collection>/{id}` (e.g. `workflow_rules`, `field_updates`, `tasks`, `webhooks`) — not covered by its own reference file here, but useful for cleaning up anything created by mistake.

## Scopes

`ZohoCRM.settings.workflow_rules.ALL` (create/list/reorder rules, associate actions), `ZohoCRM.settings.automation_actions.ALL` (create field-update/task/webhook actions)

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-workflow-automation" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
