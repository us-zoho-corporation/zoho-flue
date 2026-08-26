# Update Blueprint States

`PUT /crm/v8/settings/blueprints/{blueprint_id}/states` (with `id` per state in the body) or `PUT /crm/v8/settings/blueprints/{blueprint_id}/states/{blueprint_state_id}`

Updates one or more existing states (up to 50 per request) — in practice, this is how you add/change/remove a state's escalation config.

## Parameters (body.states[], each object)

| Name | Required | Description |
|---|---|---|
| id | yes | State ID to update |
| state_escalation | no | Same shape as Create Blueprint States; omit to leave unchanged, set fields to update |

## Sample input

```json
{
  "states": [
    {
      "id": "479441000000123433",
      "state_escalation": {
        "period": "days", "value": 10,
        "trigger_details": [
          { "period": "days", "execute_type": "on", "value": 14, "actions": [{ "name": "SLA", "type": "sla", "details": { "escalate_to": [{ "id": "479441000000023477", "type": "user" }] } }] }
        ]
      }
    }
  ]
}
```

## Response

```json
{ "states": [{ "code": "SUCCESS", "details": { "id": "4794410000001087332" }, "message": "State updated successfully", "status": "success" }] }
```

## Errors

Invalid blueprint/state/action/trigger-detail ID, an invalid `period`/`execute_type`/action `type` enum value, or `period`+`value` given without each other (they're a dependent pair).

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.states.ALL` or `ZohoCRM.settings.blueprint.states.UPDATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
