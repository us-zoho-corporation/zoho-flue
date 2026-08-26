# Create Blueprint States

`POST /crm/v8/settings/blueprints/{blueprint_id}/states`

Adds one or more states to an existing Blueprint (up to 50 per request). Each state maps one picklist value of the Blueprint's process field to a stage — get valid picklist option IDs from the Fields Metadata API (`zoho-crm-modules-and-fields` skill) first.

## Parameters (body.states[], each object)

| Name | Required | Description |
|---|---|---|
| process_id | yes | Blueprint ID (also in the URL) |
| module | yes | `{ api_name, id }` — must match the Blueprint's own module |
| pick_list_value | yes | `{ actual_value, id }` — the process field's picklist option this state represents |
| state_escalation | no | `{ period: "days"\|"hours"\|"minutes"\|"business_days"\|"business_hours", value, trigger_details: [{ period, execute_type: "before"\|"on"\|"after", value, actions: [{ type, details: { name, id } }] }] }` |

## Sample input

```json
{
  "states": [
    {
      "process_id": "4794410000001096657",
      "module": { "api_name": "Leads", "id": "4794410000000000125" },
      "pick_list_value": { "actual_value": "State_2341", "id": "4794410000000002341" },
      "state_escalation": {
        "period": "days", "value": 12,
        "trigger_details": [
          { "period": "days", "execute_type": "on", "value": 0, "actions": [{ "type": "email_notifications", "details": { "name": "Email Alert", "id": "4794410000001096634" } }] }
        ]
      }
    }
  ]
}
```

## Response

```json
{ "states": [{ "code": "SUCCESS", "details": { "id": "4794410000001096524" }, "message": "State created successfully", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.states.ALL` or `ZohoCRM.settings.blueprint.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- A newly created state isn't reachable by any record until a transition/connection targets it — see Create Blueprint Transitions.
