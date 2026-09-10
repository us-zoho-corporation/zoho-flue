# Activate Blueprint

`POST /crm/v8/settings/blueprints/{blueprint_id}/actions/activate`

Publishes a Blueprint draft, republishes a draft over an already-active version, or reactivates a previously deactivated Blueprint.

## Parameters (body.blueprints[0], one object — only needed when republishing over a version that has active records)

| Name | Required | Description |
|---|---|---|
| move_records | no | Whether records currently in-process on the existing active version should move to the newly published version |
| map_states | no (required if `move_records: true` and states changed) | `[{ existing_state: { id }, replacing_state: { id } }]` — maps each existing state's picklist ID to its replacement in the new version |

## Sample input

```json
{
  "blueprints": [
    {
      "move_records": true,
      "map_states": [
        { "existing_state": { "id": "675112000000531084" }, "replacing_state": { "id": "675112000000532034" } }
      ]
    }
  ]
}
```

## Response

```json
{ "blueprints": [{ "code": "SUCCESS", "details": { "id": "6725867000002483149" }, "message": "Blueprint successfully published", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.UPDATE` or `ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Only one Blueprint can be active per module+layout combination; activating a draft that overlaps another active Blueprint's module+layout will fail.
- Companion to Deactivate Blueprint — check `status` via Get Blueprints first to know which action applies.
