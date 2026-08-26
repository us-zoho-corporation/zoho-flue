# Get Blueprint Transitions

`GET /crm/v8/settings/blueprints/transitions?ids={id1,id2,...}` — get multiple transitions by ID.
`GET /crm/v8/settings/blueprints/transitions/{blueprint_transition_id}` — get one transition.

There is no plain "list all transitions" call — use Get Blueprints (with `fields=transition`) or a single Blueprint's `transitions` array to discover IDs first.

## Parameters

| Name | Required | Description |
|---|---|---|
| ids | one-of | Comma-separated transition IDs (bulk-get form) |
| blueprint_transition_id | one-of | A single transition ID (path form) |

## Response

```json
{
  "transitions": [
    {
      "id": "...", "name": "...", "api_name": "...",
      "process_id": "...",
      "trigger_type": "manual", "transition_type": "standalone_transition",
      "criteria": null, "color_code": "#2385ef",
      "module": { "api_name": "Deals", "id": "..." },
      "owners": [{ "type": "record_owner", "resources": [] }],
      "during_inputs": [
        { "id": "...", "type": "field", "optional": false, "sequence": 1, "field": { "api_name": "...", "id": "..." }, "validation_filter": null }
      ],
      "actions": [{ "type": "tasks", "name": "reminder", "id": "..." }]
    }
  ]
}
```

`during_inputs[].type` is one of `field`, `related_list`, `info`, `attachment`, `tags`, `notes`, `checklist`, `widget`, `kiosk` — what the user must supply at the moment they fire this transition. `actions` are the After-Transition automation this transition fires once complete.

## Scopes

`ZohoCRM.settings.blueprint.transitions.read`

## Notes

- Read-only — no HITL confirmation needed.
