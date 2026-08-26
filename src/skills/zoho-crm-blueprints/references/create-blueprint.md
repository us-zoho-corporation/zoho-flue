# Create Blueprint

`POST /crm/v8/settings/blueprints`

Creates a new Blueprint for a module+layout. Only one Blueprint object per request. In practice, building a usable Blueprint from scratch in one call means supplying `states`, `transitions`, and `connections` together — check Get Blueprint Usage Configurations first for the field limits and supported values for the target module/layout, and Get Fields/Get Layouts (`zoho-crm-modules-and-fields` skill) for the process field's valid picklist values and their IDs.

**Recommended two-phase approach:**
1. If a transition needs an action (field update, task, webhook, email alert), create that action first via the relevant Get/Create API in `zoho-crm-workflow-automation`, and note its `id`.
2. Create the Blueprint here with `states`, `transitions`, and `connections`, but with **no `actions` on any transition yet** and **no `chart_data`** (see below).
3. Attach the action(s) afterward with Update Blueprint Transitions, passing `actions: [{ name, id, type }]`.

## Parameters (body.blueprints[0], one object)

| Name | Required | Description |
|---|---|---|
| name | yes | Blueprint display name |
| api_name | no | Blueprint API name (auto-derived from `name` if omitted) |
| description | no | Free text |
| module | yes | `{ api_name }` or `{ id }` — the module this Blueprint governs |
| layout | yes | `{ api_name }` or `{ id }` — the layout it applies to |
| field | yes | `{ api_name }` or `{ id }` — the picklist "process field" whose values become states (e.g. Lead_Status) |
| continuous | no | **Not** `is_continuous` (a common mistake — that name is silently ignored). `true` for continuous (uninterrupted) execution; `false` (default) for one-time progression |
| owners | conditional | `[{ type: "users"|"role"|"group"|"record_owner"|"portal_user_type", resources: [{ id }] }]`. Required when `continuous` is `true` |
| entry_criteria | no | `{ comparator, field: { api_name, id }, type: "value"|"field", value }` — which records may enter the process |
| pipeline | no | Deals only: `{ id }` to scope the Blueprint to one sales pipeline |
| states | yes | Array of state objects — see Create Blueprint States for the shape. Each state object needs its **own** `module` (matching the parent blueprint's), even inline here |
| transitions | yes | Array of transition objects — see Create Blueprint Transitions for the shape. Each transition object needs its **own** `module` and `layout` (matching the parent blueprint's), even inline here |
| connections | yes | `[{ api_name, from_state: { api_name }, to_state: { api_name }, transitions: { api_name, name } }]` — wires each transition to its source/target state. Real field names are `from_state`/`to_state` (not `source`/`target`), and `transitions` is a **singular object**, despite the plural name, not an array |
| chart_data | do not send | `{ nodes: [...], canvas_size: {...} }` — visual layout for the Blueprint editor. **Omit entirely on Create.** Sending it here silently causes `INVALID_DATA` with no field-level detail. Add it later via Update Blueprint once the Blueprint exists and you want the visual editor to render a specific layout |

## Sample input (2 states, 1 transition, no action, no chart_data)

```json
{
  "blueprints": [{
    "name": "Account Blueprint 1",
    "description": "...",
    "module": { "api_name": "Accounts", "id": "..." },
    "layout": { "api_name": "Standard__s", "id": "..." },
    "field": { "api_name": "Rating", "id": "..." },
    "continuous": false,
    "states": [
      { "module": { "api_name": "Accounts", "id": "..." }, "api_name": "Active", "pick_list_value": { "actual_value": "Active", "id": "..." } },
      { "module": { "api_name": "Accounts", "id": "..." }, "api_name": "Acquired", "pick_list_value": { "actual_value": "Acquired", "id": "..." } }
    ],
    "transitions": [
      { "api_name": "Acquire", "name": "Acquire", "module": { "api_name": "Accounts", "id": "..." }, "layout": { "api_name": "Standard__s", "id": "..." }, "trigger_type": "manual", "transition_type": "standalone_transition" }
    ],
    "connections": [
      { "api_name": "Active_to_Acquired", "from_state": { "api_name": "Active" }, "to_state": { "api_name": "Acquired" }, "transitions": { "api_name": "Acquire", "name": "Acquire" } }
    ]
  }]
}
```

Note `states[].api_name`/`transitions[].api_name` here (not just `pick_list_value`/`name`) are what `connections[].from_state`/`to_state`/`transitions` reference by `api_name` — keep them consistent across the three arrays.

## Response

```json
{ "blueprints": [{ "code": "SUCCESS", "details": { "id": "..." }, "message": "blueprint created successfully", "status": "success" }] }
```

## Scopes

`ZohoCRM.settings.blueprint.ALL` or `ZohoCRM.settings.blueprint.CREATE`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Consider using `propose_mutation_batch` if creating the Blueprint's states/transitions as separate follow-up calls rather than inline in this one request.
- `INVALID_DATA` with no further detail: check for `chart_data` present, a `source`/`target`/`transition` shape in `connections` instead of `from_state`/`to_state`/`transitions`, or a missing per-item `module`/`layout` on a state or transition.
