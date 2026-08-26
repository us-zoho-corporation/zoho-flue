# Get Blueprint Usage Configurations

`GET /crm/v8/settings/blueprints/usage_configurations?module={module_api_name}&layout_id={layout_id}`

Returns the validation rules, character limits, supported component types, and enum values for building a Blueprint on a given module+layout — check this before Create Blueprint/Create Blueprint States/Create Blueprint Transitions to avoid guessing at limits (e.g. max name length, which `during_inputs` types a `continuous` Blueprint disallows, minimum escalation timebox value).

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | Module API name |
| layout_id | yes | Layout ID |

Note: this API is only available on `com`, `eu`, `in`, `au`, `ca`, `cn`, and `jp` domains.

## Response (shape, abridged)

```json
{
  "blueprints": [
    {
      "process": {
        "name": { "unsupported_characters": ["`", "~", "!", "..."], "max_length": 50 },
        "description": { "unsupported_characters": ["..."], "max_length": 1000 },
        "type": [
          { "blueprint_type": "normal", "unsupported_components": null },
          { "blueprint_type": "continuous", "unsupported_components": [{ "name": "input_components", "input_components": ["kiosk", "widget"] }, { "name": "transitions", "types": ["parallel_transition"] }] }
        ]
      },
      "owners": { "types": ["user", "role", "user_group", "portal", "team_user", "team_profile"], "limit": 100 },
      "timebox": {
        "period": [{ "name": "hours", "display_name": "Hour(s)" }, { "name": "minutes", "display_name": "Minute(s)" }, { "name": "days", "display_name": "Day(s)" }, { "name": "b_hours", "display_name": "Business Hour(s)" }, { "name": "b_days", "display_name": "Business Day(s)" }],
        "minimum_values": { "unit": 15, "period": "minutes" }
      },
      "transitions": { "trigger_type": [{ "name": "automatic", "supported_transition_types": [{ "name": "standalone_transition", "common_source": true, "limit": null, "supported_components": [{ "name": "timebox", "mandate_subcomponent": true }, { "name": "transition_groups", "supported_subcomponents": ["after"] }] }] }] }
    }
  ]
}
```

Key takeaway: a `continuous` Blueprint (`continuous: true` on Create Blueprint) cannot use `kiosk`/`widget` during-inputs or `parallel_transition`, and automatic transitions have a minimum wait of 15 minutes by default — always confirm the real values from this response rather than assuming these defaults, they vary by org/module/layout.

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.READ`

## Notes

- Read-only — no HITL confirmation needed.
