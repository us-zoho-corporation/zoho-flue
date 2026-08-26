---
name: zoho-crm-blueprints
description: Read and drive a Zoho CRM Blueprint — the guided, multi-step approval process attached to a module (e.g. Lead qualification, Deal stage sign-off) — and configure Blueprints themselves (states, transitions, entry criteria). Use when an agent needs to see what transitions a record can make next, move a record forward along its process ("mark this deal as won", "advance this case to the next stage"), or set up/inspect a Blueprint's states and transitions, e.g. "what's the next step for this lead?", "push this record to the next blueprint stage", "create a blueprint state for Deals".
---

A Blueprint is Zoho CRM's guided process: a module's records move through a sequence of **states** (stages) connected by **transitions** (the actions that move a record from one state to the next), each of which can require specific fields, attachments, or checklist items before it completes. This skill covers both sides: reading/executing transitions on a specific record, and creating/inspecting the Blueprint configuration itself (states, transitions, entry criteria) — the same setup normally built by hand in Setup > Automation > Blueprint.

Only one Blueprint can be active per module+layout combination, and a record can only transition if it is currently assigned to an active Blueprint process — `RECORD_NOT_IN_PROCESS` means the record isn't in one.

## Operations

| Operation | Method | Description |
|---|---|---|
| [Get Blueprint Data](references/get-blueprint-data.md) | `GET /crm/v8/{module}/{id}/actions/blueprint` | Get a record's current state, its next available transitions, and each transition's required fields |
| [Execute Blueprint Transition](references/execute-blueprint-transition.md) | `PUT /crm/v8/{module}/{id}/actions/blueprint` | Move a record along its Blueprint by completing one transition |
| [Get Blueprints](references/get-blueprints.md) | `GET /crm/v8/settings/blueprints(/{id})` | List all Blueprints, or get one Blueprint's full states/transitions/connections config |
| [Create Blueprint](references/create-blueprint.md) | `POST /crm/v8/settings/blueprints` | Create a new Blueprint for a module+layout, with its states, transitions, and connections |
| [Update Blueprint](references/update-blueprint.md) | `PUT /crm/v8/settings/blueprints(/{id})` | Update a Blueprint's owners, entry criteria, continuous flag, or chart layout |
| [Get Blueprint States](references/get-blueprint-states.md) | `GET /crm/v8/settings/blueprints/{blueprint_id}/states(/{state_id})` | List a Blueprint's states, or get one state's config |
| [Create Blueprint States](references/create-blueprint-states.md) | `POST /crm/v8/settings/blueprints/{blueprint_id}/states` | Add one or more states to an existing Blueprint |
| [Update Blueprint States](references/update-blueprint-states.md) | `PUT /crm/v8/settings/blueprints/{blueprint_id}/states(/{state_id})` | Update a state's escalation config |
| [Get Blueprint Transitions](references/get-blueprint-transitions.md) | `GET /crm/v8/settings/blueprints/transitions(/{id})` | List transitions by ID, or get one transition's full config |
| [Create Blueprint Transitions](references/create-blueprint-transitions.md) | `POST /crm/v8/settings/blueprints/transitions` | Add one or more transitions (criteria, during-fields, actions) to a Blueprint |
| [Update Blueprint Transitions](references/update-blueprint-transitions.md) | `PUT /crm/v8/settings/blueprints/transitions(/{id})` | Update an existing transition's config |
| [Get Blueprint Usage Configurations](references/get-blueprint-usage-configurations.md) | `GET /crm/v8/settings/blueprints/usage_configurations` | Get the field limits/validation rules/supported values for building a Blueprint on a given module+layout |

Blueprints, Blueprint States, and Blueprint Transitions each also support `DELETE` at the same path (optionally with `?ids=` for bulk delete) — not covered by its own reference file here, but useful for cleaning up anything created by mistake.

## Scopes

`ZohoCRM.modules.{module}.READ` / `.UPDATE` (record-level Get/Execute Blueprint Data), `ZohoCRM.settings.blueprint.ALL` or the narrower `ZohoCRM.settings.blueprint.{states,transitions}.{READ,CREATE,UPDATE,DELETE}` alternatives (Blueprint config). `ZohoCRM.settings.blueprint.ALL` does **not** come for free with `ZohoCRM.settings.ALL` — Zoho requires it as its own explicitly-granted scope, so it's listed separately in this repo's `zohoProducts.crm.scopes` (`src/config.ts`); a user connected before this scope was added needs to reconnect (or click "Connect all" in Settings) to pick it up.

## In this repo

Executed via the generic `zoho_api` tool (`src/tools/zoho-api.ts`) — `{ method, url, body }` against `https://www.zohoapis.com`. The `assistant` agent (`src/agents/assistant.ts`) fetches this skill's full body on demand with `zoho_skill_get({ skill: "zoho-crm-blueprints" })`; pass `reference` to fetch one operation's detail file. Mutating calls (`POST`/`PUT`/`PATCH`/`DELETE`) must be confirmed with the user before executing — this includes Execute Blueprint Transition, which changes the record's real data and stage.
