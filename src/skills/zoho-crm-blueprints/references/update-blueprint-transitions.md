# Update Blueprint Transitions

`PUT /crm/v8/settings/blueprints/transitions` (with `id` per transition in the body) or `PUT /crm/v8/settings/blueprints/transitions/{blueprint_transition_id}`

Updates one or more existing transitions. Same field shapes as Create Blueprint Transitions — send only the keys you want changed plus `id`.

## Parameters (body.transitions[], each object)

Same as Create Blueprint Transitions, plus:

| Name | Required | Description |
|---|---|---|
| id | yes | Transition ID to update |

## Sample input

```json
{
  "transitions": [
    {
      "id": "5843104000004358026",
      "name": "Collect Requirements",
      "description": "",
      "trigger_type": "manual",
      "transition_type": "standalone_transition",
      "color_code": "#2385ef",
      "module": { "api_name": "Deals", "id": "5843104000000002181" },
      "during_inputs": [
        { "type": "widget", "optional": true, "sequence": 1, "widget": { "name": "Insurance_Sales_Process", "id": "5843104000004358896" } }
      ],
      "actions": null,
      "owners": [{ "type": "record_owner", "resources": [] }],
      "criteria": null
    }
  ]
}
```

## Response

```json
{ "transitions": [{ "code": "SUCCESS", "details": { "id": "5843104000004358026" }, "message": "Transition updated successfully", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.states.ALL` or `ZohoCRM.settings.blueprint.transitions.UPDATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Attach `actions: [{ name, id, type }]` (e.g. a field update) to a transition here as a separate follow-up call, not inline on Create Blueprint Transitions — see Create Blueprint's "Recommended two-phase approach".
- A `401 OAUTH_SCOPE_MISMATCH` on this call can happen even when `check_zoho_connection` reports the `crm` product (with `blueprint.ALL`) as connected. Treat this as a connection issue, not a payload issue: have the user reconnect Zoho CRM in Settings.
