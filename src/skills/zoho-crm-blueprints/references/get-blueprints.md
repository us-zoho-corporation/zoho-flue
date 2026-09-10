# Get Blueprints

`GET /crm/v8/settings/blueprints` — list all Blueprints in the org.
`GET /crm/v8/settings/blueprints/{blueprint_id}` — get one Blueprint's full config (states, transitions, connections, chart layout).

## Parameters

| Name | Required | Description |
|---|---|---|
| blueprint_id | no | Omit to list all; include to get one Blueprint's full detail |
| fields | no | (single-Blueprint only) Comma-separated `state`, `transition` to include those on demand |
| module | no | (list-all only) Filter to one module's API name (e.g. `Leads`) |
| status | no | (list-all only) Filter by `active`, `draft`, or `inactive` |
| layout_id | no | (list-all only) Filter to one layout |
| sort_by | no | (list-all only) Only `modified_time` is supported |
| sort_order | no | (list-all only) `asc` or `desc` |
| page | no | (list-all only) Page number |
| per_page | no | (list-all only) Default 200 |

The list-all response is a flatter summary per Blueprint (`id`, `name`, `api_name`, `status`, `module`, `layout`, `field`, `continuous`, `created_by`/`modified_by`, `pipeline` for Deals) — it omits `states`/`transitions`/`connections`/`chart_data`, which only come back from the single-Blueprint call below.

## Response (single Blueprint)

```json
{
  "blueprints": [
    {
      "id": "...", "name": "...", "api_name": "...", "description": "...",
      "is_continuous": false,
      "module": { "api_name": "Leads", "id": "..." },
      "layout": { "api_name": "...", "name": "...", "id": "..." },
      "field": { "api_name": "...", "field_label": "...", "id": "..." },
      "owners": [{ "type": "record_owner", "resources": null }],
      "entry_criteria": { "comparator": "is", "field": { "api_name": "...", "id": "..." }, "type": "value", "value": "..." },
      "states": [
        { "id": "...", "name": "...", "api_name": "...", "pick_list_value": { "actual_value": "...", "id": "..." }, "module": { "api_name": "Leads", "id": "..." }, "state_escalation": null }
      ],
      "transitions": [
        { "id": "...", "name": "...", "api_name": "...", "trigger_type": "manual", "transition_type": "standalone_transition", "criteria": null, "during_inputs": [], "actions": [], "owners": [], "color_code": "#F27E22" }
      ],
      "connections": [
        { "api_name": "...", "source": { "state": { "api_name": "..." } }, "target": { "state": { "api_name": "..." } }, "transition": { "api_name": "...", "name": "..." } }
      ],
      "chart_data": { "nodes": [], "canvas_size": { "width": 0, "height": 0 } },
      "pipeline": { "id": "...", "api_name": "...", "display_value": "..." }
    }
  ]
}
```

Field meanings: `field` is the picklist "process field" the Blueprint tracks (e.g. Lead Status); `states` map picklist values to process stages; `transitions` are the actions that move a record between states; `connections` tie a transition to its source/target state for the visual editor; `pipeline` only applies to Deals when the Blueprint is scoped to one sales pipeline.

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.READ`

## Notes

- Read-only — no HITL confirmation needed.
