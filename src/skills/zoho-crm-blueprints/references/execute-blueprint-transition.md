# Execute Blueprint Transition

`PUT /crm/v8/{module_api_name}/{record_id}/actions/blueprint`

Completes one transition at a time, moving the record to that transition's next state and applying any field values it collects along the way. Always call Get Blueprint Data first to get a valid `transition_id` and the fields it expects — a wrong/expired `transition_id`, a data-type mismatch, or a failed field validation all error out.

## Parameters

| Name | Required | Description |
|---|---|---|
| module_api_name | yes | CRM module API name |
| record_id | yes | The record's ID |
| body.blueprint | yes | Array with exactly one object: `{ transition_id, data }` |
| body.blueprint[].transition_id | yes | ID from Get Blueprint Data's `transitions[].id` |
| body.blueprint[].data | no | `{ field_api_name: value }` for the transition's during-fields (plain fields, attachments, checklist items, related-list records, multi-select lookups — see samples below) |

## Sample input

Plain fields plus an attachment and a checklist:

```json
{
  "blueprint": [
    {
      "transition_id": "3652397000003921127",
      "data": {
        "Notes": "Updated via blueprint",
        "Phone": 8940372937,
        "Attachments": [
          { "$file_id": ["59cf260313b690xxx9d623a"] },
          { "$link_url": "www.zoho.com" }
        ]
      }
    }
  ]
}
```

Checklist:

```json
{
  "blueprint": [
    {
      "transition_id": "1000000034304",
      "data": { "CheckLists": [{ "list 1": true }, { "list 2": false }] }
    }
  ]
}
```

## Response

Success (HTTP 200):

```json
{ "code": "SUCCESS", "details": {}, "message": "transition updated successfully", "status": "success" }
```

## Errors

Same failure modes as Get Blueprint Data (`RECORD_LOCKED`, invalid module/record ID), plus: mandatory during-field missing, a during-field's value fails its configured validation rule, or `transition_id` doesn't match any of the record's currently-available transitions (the record may have already moved, or another user transitioned it first — re-fetch Get Blueprint Data and retry).

## Scopes

`ZohoCRM.modules.ALL` or `ZohoCRM.modules.{module_name}.UPDATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- This changes real record data (the during-fields you send) in addition to advancing the process state — summarize both the transition and any field changes in the `propose_mutation` call.
