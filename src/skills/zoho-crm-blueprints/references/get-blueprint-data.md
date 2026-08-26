# Get Blueprint Data

`GET /crm/v8/{module_api_name}/{record_id}/actions/blueprint`

Gets a record's next available transition(s), the fields available/required for each, each field's current value, and any validation on them. Use this before Execute Blueprint Transition to know what `transition_id` and `data` to send.

## Parameters

| Name | Required | Description |
|---|---|---|
| module_api_name | yes | CRM module API name (Leads, Accounts, Contacts, Deals, Cases, Quotes, etc., or a custom module) |
| record_id | yes | The record's ID |

## Response

HTTP 200:

```json
{
  "blueprint": {
    "process_info": {
      "id": "...", "field_id": "...", "api_name": "...", "field_label": "...",
      "name": "...", "column_name": "...", "field_value": "...",
      "is_continuous": false, "escalation": null
    },
    "transitions": [
      {
        "id": "...", "name": "...", "type": "manual",
        "next_field_value": "...", "criteria_matched": true,
        "next_transitions": [],
        "fields": [
          {
            "id": "...", "api_name": "...", "field_label": "...", "data_type": "...",
            "system_mandatory": false, "read_only": false, "validation_rule": null
          }
        ],
        "data": { "Field_Api_Name": "current value" },
        "execution_time": null, "percent_partial_save": 0
      }
    ]
  }
}
```

- `process_info.field_value` is the record's current state (the picklist value the Blueprint process field holds).
- `transitions` are the transition(s) a user could fire next. `type: "manual"` requires the Execute call below; `"automatic"` fires on its own after the state's configured wait time.
- Each transition's `fields` array is exactly what to populate in `data` on Execute — check `system_mandatory` before omitting one.

## Errors

| Code | HTTP | Meaning |
|---|---|---|
| `RECORD_NOT_IN_PROCESS` | 400 | Record isn't currently assigned to any Blueprint process — nothing to transition |
| `RECORD_LOCKED` | 400 | Wait until the record unlocks |
| `INVALID_MODULE` | 400 | Invalid module API name or no permission on it |
| `OAUTH_SCOPE_MISMATCH` | 401 | Token lacks `ZohoCRM.modules.{module}.READ` |
| `NO_PERMISSION` | 403 | User lacks Blueprint read permission — ask a CRM admin |

## Scopes

`ZohoCRM.modules.ALL` or `ZohoCRM.modules.{module_name}.READ`

## Notes

- Read-only — no HITL confirmation needed.
