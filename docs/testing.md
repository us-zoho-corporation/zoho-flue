# Testing

## Framework

[Vitest 4](https://vitest.dev/), configured as three selectable `projects` in one [`vitest.config.ts`](../vitest.config.ts): `unit`, `browser`, and `smoke`. Each has its own `include` glob, so a file's location and suffix determine which project picks it up — nothing else to configure per test.

## Runs by default: `unit`

```bash
pnpm test         # vitest run --project unit
pnpm test:watch   # same, in watch mode
```

- Node environment, no external services.
- Includes `src/**/*.test.ts`, colocated next to the source file they cover (e.g. `src/auth/session.test.ts`).
- Excludes `*.browser.test.*`.
- This is the suite to run while developing and before committing — no credentials or extra setup required.

## Behind a flag: `browser`

```bash
pnpm test:browser   # vitest run --project browser
```

- React component tests, named `*.browser.test.tsx`.
- Runs in headless Chromium via `@vitest/browser-playwright`.
- One-time setup: `pnpm exec playwright install chromium`.
- Opt-in because it needs a browser runtime; skip it if you haven't touched `src/chat/`.

## Behind a flag: `smoke`

```bash
pnpm test:smoke   # vitest run --project smoke
```

- Includes `tests/smoke/**/*.ts` (a `global-setup.ts` in that directory is excluded from the test files themselves — it only wires up `globalSetup`).
- Requires live credentials: `tests/smoke/global-setup.ts` loads `.env` and, if `ZOHO_OAUTH_CLIENT_ID`/`_SECRET`/`ZOHO_OAUTH_REFRESH_TOKEN` are set, pre-fetches one Zoho access token shared across the whole run. Tests that also need `ANTHROPIC_API_KEY` (e.g. running the agent end-to-end) will fail without it.
- Opt-in because it hits real Zoho/Anthropic APIs — not run by default, and not run in environments without those secrets.
- `testTimeout` is raised to 30s per test to allow for live network calls.

## Running a single project or file directly

```bash
pnpm exec vitest run --project unit src/auth/session.test.ts
pnpm exec vitest run --project smoke tests/smoke/main.ts
```

## Conventions

- Unit tests are colocated as `*.test.ts` next to the code they cover, not gathered in a separate `tests/` tree.
- Smoke tests live under `tests/smoke/` and assume live credentials — never rely on them for routine correctness checks.
- Browser component tests are optional and named `*.browser.test.tsx`.
