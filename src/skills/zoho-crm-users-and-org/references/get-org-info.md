# Get Org Info

`GET /crm/v8/org`

Gets organization information from the CRM — company name, domain, currency, time zone, license/plan details, etc.

## Parameters

None. Extra query params (e.g. `fields`) are accepted but ignored — the full org object is always returned.

## Response shape

`{"org": [{"id": "...", "company_name": "...", "currency": "...", "domain_name": "...", "license_details": {...}, ...}]}` — `org` is a single-element array, with no `info` key.

## Scopes

`ZohoCRM.org.READ`

## Notes

- Read-only, no HITL approval required.
