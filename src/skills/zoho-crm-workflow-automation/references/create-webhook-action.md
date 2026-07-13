# Create Webhook Action

`POST /crm/v8/settings/automation/webhooks`

Creates a Webhook associative action — calls an external URL when a Workflow Rule fires it.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | `{api_name, id}` — the CRM module the action targets. Omitting it returns `MANDATORY_NOT_FOUND` |
| name | yes | Action name |
| url | yes | Target URL. Omitting it returns `MANDATORY_NOT_FOUND` |
| http_method | yes | e.g. `"POST"`. This is the field Zoho expects — a `"method"` key is silently ignored (not read at all) and still triggers `MANDATORY_NOT_FOUND` for `http_method` |
| authentication | yes | `{"type": "general"}` or `{"type": "connection", "connection_name": ...}` — only these two values pass the regex Zoho validates against (`connection|general`); `{"type": "none"}` is rejected with `INVALID_DATA`. Omitting `authentication` entirely returns `MANDATORY_NOT_FOUND` |
| headers | no | `{module_parameters, custom_parameters}` |
| body | no | `{type, format}` — request body shape sent to the webhook |
| url_parameters | no | Query-string parameters appended to `url` |

Request body: `{"webhooks": [{module, name, url, http_method, authentication, ...}]}`. `feature_type` (`"workflow"`) defaults automatically and does not need to be sent.

No `?module=` query param is sent — a stray query param trips Zoho's "verify your parameter values" 400 (`INVALID_REQUEST`).

## Scopes

`ZohoCRM.settings.automation_actions.ALL`

## Notes

- Mutating — requires HITL approval. Decision options: approve / edit / reject / respond.
- Required Zoho fields are `authentication`, `http_method`, `module`, `name`, `url` — `authentication` is easy to miss since nothing else in this skill's other create endpoints requires it.
- `GET /crm/v8/settings/automation/webhooks/{id}` and `DELETE /crm/v8/settings/automation/webhooks/{id}` both work for reading back and deleting a created action.
