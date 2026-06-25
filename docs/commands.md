# Commands

Run from the repo root.

## Development

```bash
pnpm exec flue dev    # agent server on :3583 (watch mode)
pnpm chat             # chat UI on :5173, proxies to :3583 — run alongside flue dev
```

## Build

```bash
pnpm exec flue build  # compile agent server to dist/
pnpm chat:build       # compile chat UI to src/chat/dist/
```

## Agent CLI

```bash
pnpm exec flue run <agent> --input '{"message":"your prompt"}'
```

## Quality

```bash
pnpm test             # unit tests (node)
pnpm test:watch       # unit tests in watch mode
pnpm test:smoke       # smoke tests (requires live API credentials)
pnpm test:browser     # optional: React component tests in headless Chromium (Playwright)
pnpm exec tsc --noEmit
pnpm exec oxlint src/
```

`pnpm test:browser` runs `*.browser.test.tsx` files via `vitest.browser.config.ts`. It is
excluded from the default `pnpm test`. One-time setup: `pnpm exec playwright install chromium`.
