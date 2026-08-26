# Update Blueprint

`PUT /crm/v8/settings/blueprints` (with `id` in the body) or `PUT /crm/v8/settings/blueprints/{blueprint-id}`

Updates an existing Blueprint's own settings — owners, entry criteria, continuous flag, pipeline scope, or chart layout. To add/change states or transitions themselves, use the dedicated States/Transitions endpoints instead.

## Parameters (body.blueprints[0], one object)

| Name | Required | Description |
|---|---|---|
| id | yes (if not in URL) | Blueprint ID to update |
| owners | no | Same shape as Create Blueprint |
| entry_criteria | no | Same shape as Create Blueprint |
| continuous | no | Toggle continuous execution. **Not** `is_continuous` — that name is silently ignored (see Create Blueprint) |
| pipeline | no | Deals only — change the scoped pipeline |
| chart_data | no | `{ nodes: [{ x, y, state: { api_name } }], canvas_size: { width, height } }` — set the visual editor layout here, not on Create Blueprint (which silently rejects it as `INVALID_DATA`). Keep consistent with the Blueprint's actual `states`/`transitions`/`connections` |

## Response

```json
{ "blueprints": [{ "code": "SUCCESS", "details": { "id": "..." }, "message": "blueprint updated successfully", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.UPDATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
