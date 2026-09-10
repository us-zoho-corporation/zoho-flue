# Deactivate Blueprint

`POST /crm/v8/settings/blueprints/{blueprint_id}/actions/deactivate`

Deactivates a currently-published (active) Blueprint. Records already in-process are left where they are unless told to exit.

## Parameters (body.blueprints[0], one object)

| Name | Required | Description |
|---|---|---|
| exit_records | no | Whether records currently in the Blueprint process should be exited from it as part of deactivation |

## Sample input

```json
{ "blueprints": [{ "exit_records": true }] }
```

## Response

```json
{ "blueprints": [{ "code": "SUCCESS", "details": { "id": "6725867000002483149" }, "message": "Blueprint successfully deactivated", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.UPDATE` or `ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Records left in-process (`exit_records: false` or omitted) can no longer transition until the Blueprint is reactivated (see Activate Blueprint) — `RECORD_NOT_IN_PROCESS` on Execute Blueprint Transition is the usual symptom of forgetting this.
