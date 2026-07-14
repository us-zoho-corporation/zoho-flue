# zoho-flue

Exploratory repo for building LLM agents on [Flue](https://flueframework.com/) backed by Zoho Catalyst QuickML GLM.

## Directory map

Flue discovers `agents/`, `workflows/`, and `channels/` by filename, plus `app.ts`/`db.ts`/`cloudflare.ts`. Everything else under `src/` is our own organization ("organize supporting code however you prefer").

| Path | Purpose | Flue-discovered |
|---|---|---|
| `src/app.ts` | Application entrypoint — Flue routes, `/api/*`, CORS, provider wiring | yes |
| `src/agents/` | Addressable agents — one file per agent name | yes (by filename) |
| `src/workflows/` | Finite workflows — one file per name (add when needed) | yes (by filename) |
| `src/channels/` | Verified provider HTTP ingress (add when needed) | yes (by filename) |
| `src/config.ts` | All env reads and static constants | — |
| `src/providers/` | Model/LLM provider registrations only (`registerProvider` / `registerApiProvider`); wired via `providers/index.ts`'s `registerProviders()` | — |
| `src/auth/` | OAuth / credential helpers (Zoho service-account token, per-user login, sessions, cookie crypto) — not model providers | — |
| `src/store/` | Persistence — Catalyst-agnostic repository interfaces + Catalyst NoSQL/Data Store / in-memory implementations, plus Flue's `PersistenceAdapter` (`store/catalyst/flue/`, wired via `src/db.ts`) | — |
| `src/tools/` | Application-controlled tool definitions | — |
| `src/mcp/` | Programmatic MCP server clients | — |
| `src/sandboxes/` | Sandbox configs (`flue add sandbox <provider>`); wired via `sandbox:` in `defineAgent` | — |
| `src/chat/` | Browser chat UI (Vite + React) | — |
| `src/skills/` | Runtime skill catalog served to the deployed agent by the `zoho_skill_get` tool (`src/tools/zoho-skills.ts`) — currently the Zoho CRM/Desk implementation docs; distinct from `.agents/skills/` below | — |

## Code conventions

- Never read `process.env` outside `src/config.ts`. Use `config.*` everywhere else.
- No `!` non-null assertions on env variables — `required()` throws at startup if absent.
- Unit tests colocated as `*.test.ts`; smoke tests in `tests/smoke/` (live credentials); optional browser component tests as `*.browser.test.tsx` (`pnpm test:browser`).
- Never colocate a `*.test.ts` directly in `src/agents/`, `src/workflows/`, or `src/channels/` — Flue's filename discovery there globs every `.ts` file non-recursively and will try to load it as an agent/workflow/channel, crashing `flue dev` (`Vitest mocker was not initialized in this environment`). Put tests for those directories in a `__tests__/` subdirectory instead.
- Use Zod for schema validation; Valibot only where `defineTool` requires it.
- Tools hold credentials in closures — the model only sees parameter names, never raw tokens.
- Every named function — function declarations, arrow/function expressions assigned to a `const`, and class/object methods — needs a TSDoc block (`/** ... */`) directly above it: a one-line description, `@param` per parameter, `@returns` (omit for `void`), and `@throws` for any error conditions it can raise (omit if it can't throw). Anonymous inline callbacks (e.g. `.map(x => ...)`) are exempt.

## Skills

Two distinct kinds: `.agents/skills/` holds dev-workflow skills for working on this repo (activate the relevant one before starting work); `src/skills/` holds the deployed agent's own runtime skill catalog (currently Zoho CRM/Desk implementation docs, served via `zoho_skill_get`), not for you to activate. See [docs/skills.md](docs/skills.md) for the agentskills.io spec compliance rules, four-tier context loading conventions, and this split in full.
