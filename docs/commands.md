# Commands

Run from the repo root.

## Development

```bash
pnpm dev              # agent server on :3583 (vite dev, watch mode)
pnpm chat             # chat UI on :5173, proxies to :3583 — run alongside pnpm dev
```

## Build

```bash
pnpm build            # compile agent server to dist/ (vite build)
pnpm chat:build       # compile chat UI to src/chat/dist/
```

## Agent CLI

```bash
pnpm exec flue run src/agents/<name>.ts --message "your prompt"
```

Works for a from-scratch agent with no session dependency. It does **not** work
for `assistant` — its tools require a real signed-in session (secrets `app.ts`
bootstraps at startup, the user's Zoho connection), which `flue run` never
provides (it loads only the target agent module, not `app.ts`). Exercise
`assistant` via `pnpm dev` + `pnpm chat` (or a direct request against the
running dev server) instead — see [Examples](examples.md).

## Quality

```bash
pnpm test             # unit tests (node)
pnpm test:watch       # unit tests in watch mode
pnpm test:smoke       # smoke tests (requires live API credentials)
pnpm test:browser     # optional: React component tests in headless Chromium (Playwright)
pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint src/
```

The three suites are Vitest `projects` in one `vitest.config.ts`, selected via `--project`:
`unit` (node, the default `pnpm test`), `browser` (`*.browser.test.tsx` in headless Chromium),
and `smoke` (live credentials). One-time for browser: `pnpm exec playwright install chromium`.
See [Testing](testing.md) for what runs by default vs. what's opt-in and why.
