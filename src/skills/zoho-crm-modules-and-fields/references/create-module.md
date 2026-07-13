# Create Module

`POST /crm/v8/settings/modules`, then `POST /crm/v8/settings/fields` per initial field

Creates a new custom CRM module, then adds any requested initial fields in a second pass.

## Parameters

| Name | Required | Description |
|---|---|---|
| singular_label | yes | Singular display name for the new module (e.g. "Session"). |
| plural_label | yes | Plural display name for the new module (e.g. "Sessions"). Max 25 characters — longer values 400 with `INVALID_DATA`. Zoho assigns this as the module's `api_name` (whitespace stripped). |
| profiles | yes | Array of `{"id": "<profile_id>"}` granting the module to those profiles. Get profile IDs from `GET /crm/v8/settings/profiles` (see Flow). |
| fields | no | Optional initial fields to add immediately after the module is created. Each entry: `{"field_label": "...", "data_type": "..."}` (plus any type-specific keys, passed through as `options` to field creation) |

## Flow

1. `GET /crm/v8/settings/profiles` — returns `{"profiles": [{"id": "...", "name": "...", "api_name": "...", ...}]}` for the org. Use this directly to get profile IDs; it needs the same `ZohoCRM.settings.modules` scopes already used elsewhere in this skill, not a separate users scope.
2. `POST /crm/v8/settings/modules` with body:
   ```json
   {"modules": [{
     "singular_label": "<singular_label>",
     "plural_label": "<plural_label>",
     "profiles": [{"id": "<profile_id>"}, ...]
   }]}
   ```
   `profiles` is required. `display_field` is optional — if omitted, Zoho auto-creates a default text field labeled "Name" as the display field. Response: `201` with `{"modules": [{"code": "SUCCESS", "details": {"id": "<module_id>"}, "message": "module created successfully", "status": "success"}]}`.
3. If `fields` was provided: for each entry, `POST /crm/v8/settings/fields?module={module_api_name}` (see [Create Field](create-field.md)). Zoho silently ignores a `fields` key inside the module-creation body itself — it does not create those fields or error, so the second pass is mandatory for initial fields. `module_api_name` is taken from the created module's `api_name` if present, else falls back to `plural_label` with whitespace stripped (Zoho assigns `api_name` as the plural_label).

## Scopes

`ZohoCRM.settings.modules.ALL` (module creation and profile lookup), `ZohoCRM.settings.fields.ALL` (field creation pass)

## Notes

- Mutating — requires HITL approval.
- Idempotency is the caller's responsibility: call [List Modules](list-modules.md) first to confirm the module doesn't already exist.
- Admin access required on the Zoho org.
- `DELETE /crm/v8/settings/modules/{module_id}` deletes a custom module. Response is `202` with `{"code": "SCHEDULED", "details": {"job_id": "..."}, "message": "The module has been scheduled for deletion successfully.", "status": "success"}` — deletion is asynchronous but generally completes within a few seconds. A subsequent `GET` on the deleted module ID may return either `204` (empty) or `400 INVALID_MODULE`.
