# Create Record

`POST /crm/v8/{module}`

Creates a new record in any CRM module.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name |
| data | yes | Field-value pairs for the new record, sent as request body `{"data": [data]}` |

## Scopes

`ZohoCRM.modules.{module}.CREATE` (module name lowercased; `Sales_Orders` maps to scope segment `salesorders`; `Activities` is a read-only composite view with no write scope — write to `Tasks` or `Events` directly)

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- **Never guess a picklist field's value** (e.g. `Stage`, `Lead_Source`, `Industry`) — Zoho rejects any value the org hasn't actually configured, and picklists are customized per org/layout, so there's no universal default to fall back on. First call `zoho_skill_get({ skill: "zoho-crm-modules-and-fields", reference: "get-layouts" })` for the module's real, layout-scoped values (a *different* skill than this one — a separate `zoho_skill_get` call, not a `zoho_api` call). This matters most when *you're* the one inventing the data (e.g. "create a sample/dummy record") — there's no real-world value to draw from at all in that case, only the org's configured ones.
- **Deals specifically:** `Pipeline` is mandatory whenever the module has pipelines enabled, and `Stage` is mandatory whenever `Pipeline` is — but `Stage`'s valid values depend on *which* `Pipeline` you picked (different pipelines can have entirely different stages). Get Layouts alone isn't enough here: after it gives you a `layout_id`, also call `zoho_skill_get({ skill: "zoho-crm-modules-and-fields", reference: "get-pipelines" })`, then use one pipeline's `actual_value` for `Pipeline` and one of *that same pipeline's* `maps[].actual_value` entries for `Stage` — never pair a stage from one pipeline with a different one.
