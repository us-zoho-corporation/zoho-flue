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

Zoho's docs give only `ZohoCRM.settings.blueprint.states.read` for this endpoint (unlike every other Blueprint read endpoint, which offers a `blueprint.ALL`/`blueprint.READ` fallback) — given the sibling `blueprint.transitions.*` scopes are confirmed rejected at the consent screen, treat this one as unverified too and fall back to `ZohoCRM.settings.blueprint.ALL` if it's rejected.

## Notes

- Read-only — no HITL confirmation needed.
