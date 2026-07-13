---
name: zoho-crm-query
description: Run COQL (CRM Object Query Language) SQL-like queries against Zoho CRM for cross-module joins (pulling related-record fields via dot notation) and GROUP BY distinct-value listing. Use when an agent needs joined CRM data spanning a lookup relationship — e.g. "list deals with their account's industry" — rather than a simple single-module filter (use zoho-crm-records Search Records for that instead). Note: COQL does not support aggregate functions (COUNT/SUM/AVG/MIN/MAX) despite the SQL-like syntax — for totals or counts, list/search the records and aggregate client-side.
---

## Run COQL Query

`POST /crm/v8/coql`

Executes a COQL (CRM Object Query Language) query — SQL-like `SELECT` syntax. Use for cross-module joins (dot notation to reach a lookup field's related record, e.g. `Account_Name.Industry`) and for listing distinct values via `GROUP BY`. **Aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) are rejected outright** — `SELECT COUNT(id) FROM Deals ...` fails with `INVALID_QUERY: unsupported column`, in the plain-select form and in every `GROUP BY` variation tried. `GROUP BY` without an aggregate still works and returns one row per distinct value of the grouped field(s). For simple single-module filters, prefer Search Records (see the `zoho-crm-records` skill) instead — the plain `criteria` filter on List Records is ignored.

A `WHERE` clause is mandatory on every query, including plain `SELECT ... FROM module` with no other filter — omitting it fails with `SYNTAX_ERROR: missing clause (where)`. Use a tautology like `WHERE id is not null` if there's no real filter to apply.

Examples:
```
SELECT Deal_Name, Stage, Amount FROM Deals WHERE Amount > 10000 LIMIT 50
SELECT Deal_Name, Account_Name.Account_Name, Account_Name.Industry FROM Deals WHERE Amount > 0 LIMIT 10
SELECT Stage FROM Deals WHERE Amount > 0 GROUP BY Stage
SELECT Deal_Name, Account_Name, Amount FROM Deals WHERE Amount > 100000 ORDER BY Amount DESC LIMIT 10
```

### Parameters

| Name | Required | Description |
|---|---|---|
| query | yes | The COQL query string (`select_query` in the request body: `{"select_query": query}`) |

### Scopes

`ZohoCRM.coql.READ`

### Notes

- Read-only, no HITL approval required.
- Zoho caps each call at 200 rows; a query needing more must page with `LIMIT <offset>, <count>` and re-issue the call.
- Returns HTTP 204 with an empty body when nothing matches — there is no `data` array in that case.

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-query" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing.
