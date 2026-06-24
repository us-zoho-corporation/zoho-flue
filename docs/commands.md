# Commands

Run from the repo root. `--root` and `--env` flags are unnecessary — flue resolves both from cwd and auto-loads `.env`.

## Running

```bash
pnpm exec flue run <agent> --input '{"message":"your prompt"}'  # run an agent
pnpm exec flue build                                             # compile to dist/
pnpm exec flue dev                                               # watch-mode dev server on :3583
```

## Quality checks

```bash
pnpm test                       # unit tests
pnpm test:watch                 # unit tests in watch mode
pnpm test:smoke                 # smoke tests (requires live API credentials)
pnpm exec tsc --noEmit          # type-check (no output = clean)
pnpm exec oxlint src/           # lint all source
```
