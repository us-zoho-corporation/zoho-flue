# Get Pipelines

`GET /crm/v8/settings/pipeline?layout_id={layout_id}`

Gets all pipelines configured for a Deals layout (or one, at `/settings/pipeline/{pipeline_id}?layout_id={layout_id}`) — each pipeline's `actual_value` is the value to send for the Deal's `Pipeline` field, and its `maps[]` array lists the stages that belong to *that specific pipeline*; each map's `actual_value` is the value to send for `Stage`.

## Parameters

| Name | Required | Description |
|---|---|---|
| layout_id | yes | A Deals layout id — get it from [Get Layouts](get-layouts.md) first |

`layout_id` is mandatory for both the "all" and "specific pipeline" forms — omitting it errors.

## Response

```
{"pipeline": [{
  "actual_value": "Standard",
  "default": true,
  "maps": [
    {"actual_value": "Qualification", "sequence_number": 1, ...},
    {"actual_value": "Closed Won", "sequence_number": 7, ...},
    ...
  ]
}, ...]}
```

## Scopes

`ZohoCRM.settings.pipeline.READ`

## Notes

- Read-only, no HITL approval required.
- **Only call this for the Deals module** — `Pipeline` isn't a field on any other module.
- `Pipeline` is mandatory on a Deal *only when the module has pipelines enabled* — but if it is, `Stage` becomes mandatory too, and Zoho rejects any `Stage` value that isn't in the selected pipeline's own `maps[]` (different pipelines can have entirely different stage sets). Fetch this first and pick a real `actual_value` pair — for creating a record with no real data to go on (e.g. dummy/sample data), use the `default: true` pipeline and its first `maps[]` entry rather than a guessed name like `"Standard"` or `"Qualification"`, since neither is guaranteed to exist for this specific org.
