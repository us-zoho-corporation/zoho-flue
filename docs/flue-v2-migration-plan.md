# Flue 1.0.0-beta.9 → 2.0.3 migration plan

## Context

This app runs on `@flue/runtime`/`@flue/react`/`@flue/sdk`/`@flue/cli` `1.0.0-beta.9`. The current published Flue major version is `2.0.3` — jumping straight from beta to a stable major with no intermediate releases. This is **not a routine dependency bump**: Flue 2 is a ground-up architectural rewrite (agent definition model, routing, providers, persistence contract, CLI/build, SDK client). This plan exists so a fresh agent session — with no memory of the investigation that produced it — can execute the migration without re-discovering the scope from scratch.

Primary sources (read before starting, they teach the *why* and the new APIs; this plan only maps *this repo's* old code onto them):
- Official migration guide: `pnpm exec flue docs read guide/migration` (also at https://flueframework.com/docs/guide/migration/) — the authoritative field-by-field mapping this plan is derived from.
- Announcement blog post: https://flueframework.com/blog/flue-2/ — the rationale (static `defineAgent` config "broke down for more complex, non-trivial agents"; agents need to evolve capabilities mid-conversation, hence the hooks model).
- Read `guide/building-agents`, `guide/agent-hooks-api` (or `reference/agent-hooks-api`), `guide/routing`, and `guide/workflows` via `flue exec flue docs read <path>` before writing new agent code — this plan tells you *what* to change, not how the replacement APIs work.

## Hard blocker: resolve this before touching code

> **Flue 2 stores schema version 8; beta stores version 5. There is no in-place migration — the v2 runtime rejects a v5 database outright, before any application code runs.**

This app's production persistence is Catalyst-backed (`STORE_BACKEND=catalyst`, `src/db.ts` → `src/store/catalyst/flue/adapter.ts`), storing live agent conversations. Before writing any migration code, get an explicit decision from a human on:
1. **Is existing production conversation history (Catalyst NoSQL tables under the Flue adapter) disposable?**
   - If yes: plan a drained deployment — stop traffic, deploy v2 against fresh tables (or truncate the existing ones), resume.
   - If no: export it through the *current* (beta) deployed app before upgrading anything, and re-seed after — the export path has to be built and run against the live beta app, which has its own lead time.
2. This decision gates everything else. Do not proceed past this section without it recorded somewhere (a ticket, this file's own follow-up, whatever this repo's convention is).

## Scope in this repo

Everything below is a *file-level* map of the official guide's checklist onto what actually exists in `zoho-flue`. There are no Cloudflare-target concerns (`flue.config.ts` has `target: 'node'`, no `src/cloudflare.ts`), no `src/workflows/`, and no `src/channels/` — three whole sections of the official guide (Cloudflare deployments, Workflows-as-Cloudflare-Workflows, Channels) don't apply here beyond the generic "workflows are removed" point, which does apply (see below).

### 1. Pins and install
- `package.json`: `@flue/react`, `@flue/runtime`, `@flue/sdk`, `@flue/cli` → `2.0.3` (or whatever `npm view @flue/runtime dist-tags.latest` reports at migration time). Add `vite` (already a dep for the chat sub-app, confirm it covers the main app too), `@flue/vite`, `hono` (already a dep). No Cloudflare plugin needed.
- `@earendil-works/pi-ai`: bump alongside Flue — the new provider system (`createProvider`/`setProvider`) is Pi's own object model, and `registerFauxProvider`'s replacement (`fauxProvider`) lives in this package. Latest at investigation time was `0.84.3`; re-check.
- `@assistant-ui/react`/`@assistant-ui/react-markdown` are unused in this codebase (`grep -rl "@assistant-ui" src` turns up nothing) — unrelated to this migration, bump or ignore independently.

### 2. Build system
- Author `vite.config.ts` at the repo root for the **main app** (the chat sub-app already has its own under `src/chat/vite.config.ts` — that one is unaffected, it doesn't touch `@flue/*`). New root config:
  ```ts
  import { flue } from '@flue/vite';
  import { defineConfig } from 'vite';
  export default defineConfig({ plugins: [flue()] });
  ```
- `flue.config.ts` (repo root): change `import { defineConfig } from '@flue/cli/config'` → `'@flue/runtime/config'`. `target: 'node'` — confirm the field still exists/is still meaningful (guide says target is now "auto-detected from the plugin array" for the Vite plugin; `flue.config.ts`'s own role shrinks — re-read `guide/routing`/`guide/deploy` to confirm what if anything stays in this file).
- `package.json` scripts and every doc that tells a human/CI to run `flue dev`/`flue build`:
  - `README.md:22` (`pnpm exec flue dev`)
  - `docs/commands.md:8,15` (`pnpm exec flue dev`, `pnpm exec flue build`)
  - `docs/deploy-catalyst.md:27` (AppSail build command: `pnpm install --frozen-lockfile && pnpm run chat:build && pnpm exec flue build --target node`) — becomes a `vite build` invocation; re-verify the produced `dist/` entrypoint AppSail's start command points at hasn't changed shape.
  - `docs/architecture.md:22` (mentions `flue dev`/`flue run`/build as the three run modes app.ts loads under — update the prose, the underlying claim about app.ts loading in every mode should still hold).
- Add `.flue-vite/` and any other Vite-plugin-generated paths to `.gitignore` (Node target may generate less than Cloudflare's two artifacts, but check what `@flue/vite` actually emits for `target: 'node'` before assuming nothing needs ignoring).

### 3. Routing — `src/app.ts`
- Delete `import { flue } from '@flue/runtime/routing'` and `app.route('/', flue())` (currently `src/app.ts:1`... the import, and the mount at `src/app.ts:297`).
- Replace with `createAgentRouter` from `@flue/runtime/routing`, mounted explicitly. There is exactly one agent (`src/agents/assistant.ts`, exported as whatever the new hooks-based function ends up named — see §4). Mount it at the same path clients already use: check `src/chat/src/*` for the exact URL shape the frontend currently addresses (`/agents/<name>/<id>` per the beta convention) and preserve it via `app.route('/agents/<name>', createAgentRouter(TheAgentFunction))` so existing/rehydrated client-side conversation URLs keep working.
- `src/app.ts`'s custom `route: AgentRouteHandler` export from `assistant.ts` (conversation-ownership check + request-context population, currently wired in via the beta's per-agent-module `export const route` convention) — that convention is **deleted** in v2 ("the agent-module `export const route` and `export const attachments` conventions are deleted. Per-agent middleware becomes ordinary Hono middleware registered before the mount"). Move `assistant.ts`'s `route` handler logic (conversation-ownership claim via `getStores().conversationOwners`, `setTurnContext`, `runWithRequestContext`) to Hono middleware registered on the mount in `app.ts`, ahead of `createAgentRouter(...)`.
- `GET /api/agents` (`src/app.ts:111`, `listAgents()` from `@flue/runtime`) and `GET /api/runs`/`GET /api/workflows` (`listRuns()`, `src/app.ts:147,159`) — `listRuns` has no v2 replacement (workflows removed entirely; run inspection is gone). Check what actually consumes these three endpoints in `src/chat/src/*` before deciding a replacement — if nothing in the shipped chat UI reads them, delete the endpoints; if something does, it needs a different data source (there is no framework-level "list every known agent" or "list every run" API in v2).
- The `POST /:id` body shape changes (`{ message: { kind: 'user', body } }` instead of `{ message, images }`, plus `initialData`/`uid`) and `?wait` is gone (clients follow `streamUrl` or use the SDK's `wait()`) — this affects whatever `src/chat/src/flue-model.ts` sends today; see §6.

### 4. `src/agents/assistant.ts` — full rewrite
This file is the biggest single piece of work. Today it's `defineAgent(({ id }) => {...})` returning a `{ profile, model }` bag, built around: a shared `defineAgentProfile` (`zohoAssistant`), a per-turn rebuild of `zoho_api`/`check_zoho_connection`/`propose_mutation(_batch)`/the docs KB tools bound to that turn's user, an `AgentRouteHandler` (`route`) doing conversation-ownership + request-context setup, and `modelForConversation()`/`resolveHitlAutoApprove()` helpers.

Convert to the hooks model:
- One exported, capitalized, synchronous function (e.g. `export function Assistant({ id }: AgentProps) { ... }`) in a module carrying the `'use agent'` directive.
- `model` → `useModel(modelForConversation(id))`, called once, root render only. `modelForConversation()` itself can stay as a pure helper.
- Every tool currently spread into the `tools:` array (`defineCheckZohoConnectionTool`, `defineZohoApiTool`, `defineProposeMutationTool`/`Batch`, the static `zohoSkillTools`/`a2uiTools`/`defineRequestInputTool()`, the conditional `defineZohoKbTools(...)`, plus `mcp` from `loadUserMcpTools`) → one `useTool(...)` call per tool. Conditional tools (auto-mode gating `propose_mutation`, the `config.docsOauthClientId` gate on KB tools) are explicitly supported — "resources... may be conditional" — so the existing conditional-inclusion logic translates directly to a conditional `useTool()` call inside the function body.
- `instructions` (today a big returned string plus `confirmationPolicyInstructions(autoApprove)` appended) → the function's **return value** (a string), still composed the same way; `useInstruction()` exists if any instructions need to come from a separately-composed hook instead.
- The turn-scoped context this file currently threads through `currentTurnContext(id)`/`setTurnContext`/`runWithRequestContext` (userId, mcpTools, hitlAutoApprove, requestId, userToken) — re-home onto v2's actual per-render facilities: `AgentProps` gives `id`; anything that was "resolved once in `route` and read during the render" needs a v2-native equivalent (likely `useInitialData()` for anything set at conversation creation, and ordinary hook calls / lifecycle hooks — `useAgentStart` — for anything resolved fresh per turn, since **the agent function must now be synchronous** and re-renders before every model turn). This is the part most likely to need a design decision, not a mechanical rename — read `reference/agent-hooks-api` fully before writing this file.
- `getAuth()`/`getStores()` calls that currently happen inside `route` (async, pre-render) need a new home given the sync-function constraint — likely inside `useTool()` factory closures (a tool's own `run` stays async) rather than at agent-render time.
- Delete `defineAgentProfile` usage (`zohoAssistant`) — "removed; compose with custom hooks (plain functions calling hooks) instead." The shared tool/instruction bundle can become a plain helper function called from inside `Assistant()`.

### 5. Tools — mechanical rename, repo-wide
`defineTool({ name, description, input, output, run })` keeps its shape, but:
- `run({ input })` → `run({ data })`.
- A tool that returns a bare value now must return `{ output: <value> }` (a bare `string` is still sugar for `{ output: string }`; returning nothing is fine only when there's no `output` schema; any other bare value throws at runtime).

Apply across every `defineTool` call site:
`src/tools/a2ui.ts`, `src/tools/check-zoho-connection.ts`, `src/tools/propose-mutation.ts`, `src/tools/request-input.ts`, `src/tools/zoho-api.ts`, `src/tools/zoho-skills.ts`, `src/mcp/tools.ts`, `src/mcp/zoho-kb.ts` — and their matching `*.test.ts` files (assertions currently keyed on `run({ input: ... })` / bare return values).

Nothing in this repo currently uses `harness.session()`/`FlueSession`/`session.task()` or `harness.fs` (grep first to confirm before skipping this), so the `harness: true`/`durable: true` sections of the guide are likely opt-in upside here, not required migration work — but re-check `src/tools/zoho-api.ts` and `src/tools/propose-mutation.ts` for anything session-shaped.

### 6. Providers — `src/providers/`
`registerProvider()`/`registerApiProvider()` are deleted outright.
- `src/providers/anthropic.ts` (`registerAnthropic()`) — built-in provider patching (API key / baseUrl override, if any) moves to registering your own provider under the built-in's id, reusing its catalog: `models: anthropicProvider().getModels().map(m => ({...m, baseUrl}))`, via Pi's `createProvider()` + `setProvider()`.
- `src/providers/catalyst-glm.ts` (`registerCatalystGLM`, currently `registerApiProvider({ api, stream, streamSimple })` per the earlier read of this file) — becomes `createProvider({ id: 'catalyst-glm', auth, models, api: { stream, streamSimple } })` + `setProvider(...)`. This file already imports `@earendil-works/pi-ai` types directly (`Api`, `Model`, `AssistantMessage`, etc.) — re-verify every one of those type shapes against `0.84.x`, they may have changed independent of Flue.
- `src/providers/index.ts` (`registerProviders()`, called once from `app.ts` at startup) — same call sites, new bodies.
- `src/providers/catalyst-glm.test.ts` — update any mocking of `registerApiProvider`/the old registration bag.

### 7. Persistence — `src/db.ts` and `src/store/catalyst/flue/`
- `src/db.ts` is already at the source root under its new expected name/location (`db.ts` moved from `.flue/db.ts` → source root in v2 — this repo already does this, nothing to move) — but its **content** needs updating: `sqlite()` from `@flue/runtime/node` for the memory backend should still exist, confirm the import path is unchanged; `createCatalystPersistenceAdapter({ nosql, stratus })`'s own contract changed (next bullet).
- `src/store/catalyst/flue/run-store.ts` + `run-store.test.ts` and `event-stream-store.ts` + `event-stream-store.test.ts` — **`RunStore` and `EventStreamStore` are deleted** from the `PersistenceAdapter` contract entirely (workflows removed). Delete these files, and remove their wiring from `src/store/catalyst/flue/adapter.ts`.
- `src/store/catalyst/flue/agent-submission-store.ts` + test — `AgentSubmissionStore` **grew settlement and lease methods** (not deleted, extended). Read the new interface (`api/data-persistence-api` doc) and implement the new methods against the existing Catalyst NoSQL tables this store already manages.
- `src/store/catalyst/flue/conversation-stream-store.ts`, `attachment-store.ts`, `stratus-client.ts`, `nosql-harness.ts` — re-verify each against the new adapter contract; the guide doesn't call these out by name as deleted/changed, so they may be largely intact, but confirm.
- `@flue/runtime/test-utils` "now ships contract test suites to verify an adapter against the new obligations" — use these against the rebuilt adapter instead of hand-rolling contract tests (this repo's existing `*.test.ts` files under this directory may already follow a contract-test pattern worth comparing against the shipped one, similar in spirit to `src/store/stores-contract.ts` for the app's own stores).
- After the adapter compiles and passes the new contract tests, this is also where the "hard blocker" schema-reset decision (see top of this doc) actually gets executed operationally.

### 8. Chat frontend — `src/chat/src/`
`grep -rl "@flue/react\|FlueProvider\|useFlueAgent\|createFlueClient" src/chat/src` currently finds: `main.tsx`, `flue-model.ts`, `flue-model.test.ts`, `conversations.tsx`, `Thread.tsx`, `Thread.browser.test.tsx`.
- `@flue/react` now exports only `useFlueAgent`; `FlueProvider` and `useFlueWorkflow` are removed. Find the `<FlueProvider client={...}>` wrapper (likely in `main.tsx`) and remove it.
- `useFlueAgent({ name, id })` → `useFlueAgent({ url })` (pass the conversation's mount URL + id) or `useFlueAgent({ client })` with a memoized conversation-scoped client. `flue-model.ts` is almost certainly where the client construction/URL-building logic needs to move — read it alongside the guide's Agent SDK section before touching it.
- If this app calls `createFlueClient({ baseUrl: '/api' })` anywhere with the old deployment-wide, agent-name-addressed shape (`client.agents.send(name, id, ...)`), it becomes one client per conversation URL (`createFlueClient({ url: '/api/agents/<name>/<id>' })`), with `.send`, `.wait`, `.observe`, `.history`, `.abort`, `.attachmentUrl` instead of the `.agents.*`/`.workflows.*` namespaces.
- The outbound message shape changes (`{ message, images }` → `{ message: { kind: 'user', body } }` + optional `initialData`); this repo's attachment handling (image uploads mentioned in recent commit history — "Add image attachment support") needs its request-building code in `flue-model.ts` updated to match.
- `abort()` semantics changed to conversation-scoped (aborts all in-flight/queued work for that conversation, not one submission) — re-check any per-message abort/stop-generating button behavior in `Thread.tsx`.

### 9. Observability (if used)
Check whether `observe(...)`/`createOpenTelemetryObserver()` is registered anywhere in this app (`grep -rl "observe(\|createOpenTelemetryObserver" src`) before spending time here — if nothing in this repo hooks Flue's observability layer today, this section is a no-op.

## Verification checklist (in order)

1. `pnpm exec tsc --noEmit -p .` and (from `src/chat/`) `pnpm exec tsc --noEmit -p tsconfig.json` — clean.
2. `pnpm test` (unit project) — every `defineTool` call-site rename (§5) will otherwise show up here first.
3. `pnpm exec vite build` (new root config) and `pnpm run chat:build` (existing chat config, should be unaffected) — both succeed, and the produced `dist/` layout matches what `docs/deploy-catalyst.md`'s AppSail build/start commands expect (update that doc if the shape changed).
4. `pnpm exec vite dev` (replaces `flue dev`) boots the app; exercise the actual HTTP surface the way the OAuth-migration work in this repo's history did — `dev-login`, a chat turn through `/agents/<mount>/...`, a tool call that hits `check_zoho_connection`/`zoho_api`, one that hits the docs KB tools — against the **memory** store backend first (`STORE_BACKEND=memory`), since that sidesteps the schema-reset question entirely for local dev/CI.
5. Only after 1–4 are green, and only after the hard-blocker decision (top of this doc) is resolved: exercise the Catalyst-backed adapter path (§7) against a real or throwaway Catalyst project, confirm the new persistence adapter boots against a *fresh* (v8-schema) table set, and execute whatever drained-deployment/export-reseed plan was decided.
6. Update `README.md`, `docs/commands.md`, `docs/architecture.md`, `docs/deploy-catalyst.md` for the new `vite dev`/`vite build` commands (§2) as part of the same change, not a follow-up — they'll otherwise tell the next person to run a CLI command that no longer exists.

## Suggested sequencing

The official checklist (`flue docs read guide/migration`, "Migration checklist" section) orders this as: pins → build → routing → agents → tools → skills → sandboxes → workflows → channels/database → providers → observability → clients → deployment → verify. For this repo specifically, given there's one agent and no workflows/channels, a reasonable PR breakdown is: **(a)** pins + build + routing + provider rewrite (mechanical, testable independently of the agent rewrite), **(b)** the `assistant.ts` hooks rewrite (§4, the real design work), **(c)** the persistence adapter (§7, gated on the hard-blocker decision), **(d)** the chat frontend (§8, can happen in parallel with (b)/(c) once the new `/agents/<mount>/:id` routing shape from (a) is settled, since that's the contract the frontend actually depends on).
