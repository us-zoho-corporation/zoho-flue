# Get Blueprint States

`GET /crm/v8/settings/blueprints/{blueprint_id}/states` — list all states of one Blueprint.
`GET /crm/v8/settings/blueprints/{blueprint_id}/states/{blueprint_state_id}` — get one state.

## Parameters

| Name | Required | Description |
|---|---|---|
| blueprint_id | yes | Parent Blueprint ID |
| blueprint_state_id | no | Omit to list all states |

## Response

```json
{
  "states": [
    {
      "id": "...", "name": "...", "api_name": "...",
      "module": { "api_name": "Leads", "id": "..." },
      "pick_list_value": { "actual_value": "...", "id": "..." },
      "state_escalation": {
        "period": "days", "value": 1,
        "trigger_details": [
          { "period": "days", "execute_type": "on", "value": 0, "actions": [{ "type": "sla", "details": { "name": "SLA", "escalate_to": [{ "id": "...", "type": "user" }] } }] }
        ]
      }
    }
  ]
}
```

`state_escalation` fires its configured actions (SLA, email, task, field update, webhook, function, circuit, WhatsApp, SMS) if a record stays in that state longer than `period`/`value` — `null` if no escalation is configured.

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.READ`

## Notes

- Read-only — no HITL confirmation needed.
