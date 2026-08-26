# Create Blueprint Transitions

`POST /crm/v8/settings/blueprints/transitions`

Adds one or more transitions to a Blueprint (up to 50 per request). A transition alone doesn't move records until it's wired into the Blueprint's `connections` (see Create/Update Blueprint) linking a source state → this transition → a target state.

## Parameters (body.transitions[], each object)

| Name | Required | Description |
|---|---|---|
| name | yes | Transition name, unique within the Blueprint |
| module | yes | `{ api_name, id }` |
| trigger_type | yes | `manual` (user-fired) or `automatic` (fires after a configured wait) |
| transition_type | yes | `standalone_transition`, `parallel_transition`, or `child_transition` |
| description | no | Free text |
| color_code | no | Hex color for the transition button, e.g. `#F27E22` |
| layout | yes | `{ api_name, name, id }` — pass the same layout as the parent Blueprint |
| criteria | no | `{ group_operator: "AND"\|"OR", group: [{ comparator, field: { api_name, id }, type: "value"\|"field", value }] }` — gates whether the transition is offered |
| owners | no | `[{ type: "record_owner"\|"users"\|"role"\|"group"\|"portal_user_type", resources: [{ id, name }] \| null }]` — who may execute it |
| common_source | no | `true` to make this transition available from multiple source states (see `common_source_states`) |
| during_inputs | no | `[{ sequence, type, optional, field?: { api_name, id }, validation_filter?: {...}, items?: [...] (checklist), message?: "..." (info), widget?: { name, id } }]` |
| actions | no | `[{ name, id, type }]` — automation to run after the transition completes; `id` comes from that action type's own Get API (e.g. Get Tasks Action, Get Field Update Action from `zoho-crm-workflow-automation`) |

## Sample input

```json
{
  "transitions": [
    {
      "name": "Test Transition",
      "module": { "api_name": "Leads", "id": "4794410000000000125" },
      "trigger_type": "manual",
      "transition_type": "standalone_transition",
      "description": "Test Transition Description",
      "color_code": "#F27E22",
      "criteria": {
        "group_operator": "AND",
        "group": [
          { "comparator": "equal", "field": { "api_name": "Annual_Revenue", "id": "4794410000000000581" }, "type": "value", "value": "20000" }
        ]
      },
      "owners": [{ "type": "record_owner", "resources": null }],
      "during_inputs": [
        { "sequence": 1, "optional": true, "type": "info", "message": "New message added" },
        {
          "sequence": 2, "type": "field", "optional": false,
          "field": { "api_name": "Annual_Revenue", "id": "4794410000000000581" },
          "validation_filter": {
            "validation_message": "Annual revenue should be greater than 1000",
            "criteria": { "comparator": "less_than", "field": { "api_name": "Annual_Revenue", "id": "4794410000000000581" }, "type": "value", "value": "1000" }
          }
        }
      ],
      "actions": [{ "name": "reminder", "id": "4794410000001101962", "type": "tasks" }]
    }
  ]
}
```

## Response

```json
{ "transitions": [{ "code": "SUCCESS", "details": { "id": "4794410000001096657" }, "message": "transition created successfully", "status": "success" }] }
```

## Errors

Missing required field, invalid enum value (e.g. bad `transition_type`), conflicting action-type data, more than 10 checklist items, or a name/label exceeding its character limit (check Get Blueprint Usage Configurations for the exact limits).

## Scopes

`ZohoCRM.settings.blueprint.transitions.ALL` or `ZohoCRM.settings.blueprint.transitions.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- If a transition needs an `actions` entry, create the action first via its own Create API, create this transition without `actions`, then attach `actions` via Update Blueprint Transitions — see Create Blueprint's "Recommended two-phase approach".
