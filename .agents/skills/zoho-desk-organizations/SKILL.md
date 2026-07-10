---
name: zoho-desk-organizations
description: Resolve the Zoho Desk organization(s) (help desks) the current user belongs to, and obtain the orgId header value used to scope every other Zoho Desk API call. Use when bootstrapping Desk access, when the user asks which help desk/org they're on, or to disambiguate across multiple Desk orgs.
---

Resolves the Zoho Desk organization(s) (help desks) the current user belongs to. This is also the bootstrap call: the first org's `id` is resolved and injected as the `orgId` header on every other Desk API call.

## Endpoint

`GET /api/v1/organizations`

Lists all Desk orgs the authenticated user has access to. Call explicitly only if the user asks which help desk they're on, or to disambiguate across multiple orgs — for normal tool calls the `orgId` is resolved silently from the first available org.

### Parameters

None.

### Response

Response body is an object with a `data` array (not a bare top-level array):

```json
{"data": [{ "id": 917553231, "companyName": "...", ... }]}
```

### Response fields (per organization, in `data[]`)

| Field | Description |
|---|---|
| id | Organization id — used as the `orgId` header value for all other Desk calls |
| companyName | Company name |
| portalName | Help desk portal name |
| portalURL | Help desk portal URL |
| timeZone | Org time zone |
| primaryContact | Org contact email |
| isDefault | Whether this is the user's default org |
| edition | Zoho edition (e.g. `ZOHOONE`) |

### Scopes

`Desk.basic.READ`

### Notes

- Read-only, no HITL gate.
- If no orgs are returned, the user has not connected a Desk organization — surface a message directing them to connect Desk in Settings rather than retrying.

## Auth quirk

An `orgId` request header can be sent on every Desk API call to scope the request to a specific org. On a single-org account, other Desk endpoints (e.g. `GET /api/v1/tickets`, `/api/v1/agents`, `/api/v1/departments`) return 200 even with no `orgId` header at all — the API falls back to the user's (only) org. Sending an invalid/unknown `orgId` value returns a 422 (`UNPROCESSABLE_ENTITY`), so the header is validated when present.

Always resolve `orgId` via this endpoint and inject it as the `orgId` header on all subsequent Desk requests — it's the only way to disambiguate when a user belongs to more than one org.

Responses carry `Cache-Control: no-cache, no-store, must-revalidate` — there's no server-advertised TTL to cache against. Resolve the org id once per session rather than assuming any particular cache lifetime.

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`). Resolve `orgId` once per conversation, then pass it as `headers: { orgId }` on every other `zoho_api` call to a `desk.zoho.com` URL. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-desk-organizations" })`.
