---
name: layout-check
description: Diagnose and verify frontend layout, spacing, overlap, alignment, and responsive-design issues in the chat UI (src/chat/) using a live browser and precise DOM measurements, not screenshots alone. Use this whenever asked to fix spacing between elements, check overlap, verify "this looks right" for a CSS/layout change, or do responsive/mobile-breakpoint work. Distinct from e2e-chat (functional flow — auth, send/response, stop button) and the generic run skill (just launching the app to look at it): this is specifically for pinning down and confirming CSS/layout bugs with measured geometry, the way you'd actually debug a gap or overlap rather than guess from source.
compatibility: Requires pnpm, Node.js, a headless Chromium (Playwright), and ANTHROPIC_API_KEY in .env
allowed-tools: Bash Read Write Edit
---

## Why measure instead of eyeballing screenshots

A screenshot tells you something looks off; it rarely tells you *why*, or by
how much. Reading the CSS source and reasoning about it is faster to start
but easy to get wrong, because the rendered result depends on things source
alone doesn't show: resolved custom properties, a third-party component
library's own classes, flex/grid interactions, scroll position, and content
that varies in height turn to turn. Driving a real browser and reading the
actual computed geometry turns "does this look right?" into a number you can
check before and after a fix, and a regression you can catch immediately
instead of noticing days later.

Screenshots still matter — take one alongside every measurement. Numbers
catch precise regressions (a gap that's 10px instead of 24px); screenshots
catch things numbers don't, like color, contrast, or something reading as
"cluttered" that's numerically fine.

## Boot the app

```bash
bash .claude/skills/layout-check/scripts/boot.sh   # starts the agent server (:3583) + vite chat (:5173)
bash .claude/skills/layout-check/scripts/teardown.sh   # stop them when done
```

This reuses `e2e-chat`'s dev-login seam (`ENV=local`, `STORE_BACKEND=memory`) —
see `.claude/skills/e2e-chat/SKILL.md` for how that works. `boot.sh` refuses to
start if `:3583`/`:5173` are already busy; a stale server from an earlier
session is the most common source of confusing, flaky measurements.

**Known gotcha:** the first Playwright action (a click, a `waitForSelector`)
in a script's first run often times out — this happens even against an
already-warm server that answered a previous script just fine, so it isn't
purely "Vite is still cold-compiling"; treat it as a first-run-only flake in
general. This isn't a real failure; retry the script once before concluding
something is broken. It has never needed a third try.

## Drive to the exact state in question

Write a throwaway script, don't try to do this by hand — it needs to be
re-run after every fix. Two-step because the scratchpad directory doesn't
prompt for permission on every write, while the repo does (once) for a new
script:

1. Draft it in your scratchpad directory first.
2. Copy it into `.claude/skills/e2e-chat/scripts/<descriptive-name>.tmp.mjs`
   and run it from there with `node` — it needs the repo's installed
   `playwright` dependency, which the scratchpad path doesn't have.

Use Playwright to get to the actual state you're checking — log in via
`/api/auth/dev-login?returnTo=/`, then drive whatever produces the layout in
question (send a message, open Settings, resize the viewport, ask the
assistant to do something that triggers a mutation confirmation card, etc.).
Prefer resizing one browser context's viewport over juggling multiple browser
instances when checking several widths in one script.

**Don't edit the script again once it's copied into `scripts/` and running.**
The dev server's file watcher (`vite dev`) watches that whole directory too,
and a file change mid-conversation can kill the in-flight turn or wedge the
server outright — see the `e2e-chat` skill's Gotchas for what that looks like
and how to recover. Fix the scratchpad copy and re-copy fresh instead of
patching the live one.

**Never call `process.exit()` right after your final `console.log`s.** When
stdout is piped (not a TTY — true whenever a tool runs the script for you),
writes are async; an immediate `process.exit()` can terminate the process
before they've flushed, silently dropping every `PASS`/`FAIL` line you just
printed (you'll see only the last line or two, or nothing). Set
`process.exitCode = failures > 0 ? 1 : 0` instead and let the script exit
naturally once the event loop drains (harmless here since these scripts
don't hold anything else open after `browser.close()`).

## Measure, then screenshot

For gaps and overlaps, compare `boundingBox()` on the two elements involved —
the delta is the actual answer, not an impression:

```js
const a = await page.locator('.answer').last().boundingBox();
const b = await page.locator('.mutation-card').boundingBox();
console.log('gap', b.y - (a.y + a.height)); // negative = overlap
```

For "is this actually styled the way the source implies," read the resolved
value in the browser rather than trusting the stylesheet — a rule can be
overridden, a custom property can resolve to something unexpected, and a
component library can render different markup than you'd guess:

```js
await el.evaluate((n) => getComputedStyle(n).backgroundImage); // gradients
await el.evaluate((n) => getComputedStyle(n).transform);       // open/closed, hidden/visible
await el.evaluate((n) => getComputedStyle(n).backgroundColor); // is it actually translucent?
```

Then screenshot the same state (`page.screenshot({ path: ... })`) and read it
back with the Read tool.

### When the suspect is a third-party component (this app uses Kumo)

Don't guess from the library's source or its generated Tailwind class names —
those churn across versions and are hard to select on reliably. Inspect the
live DOM for stable hooks instead: this codebase's Kumo components carry
`data-kumo-component`/`data-kumo-part` attributes that survive class churn,
and the actual color/behavior often traces back to a CSS custom property
(e.g. `--color-kumo-brand`) set at `:root` that's simpler to override globally
than to fight per-instance.

## After a fix: run a regression pass, not just the specific check

A layout CSS change has a wider blast radius than the one thing you're
fixing — the same container often serves the welcome/empty state, a short
conversation, and a long one, plus every viewport width. Re-run your
measurement script (or a broader one) against:

- the welcome/empty state (no messages yet)
- a short conversation (doesn't fill the viewport — top-anchoring bugs hide here)
- a longer conversation that actually overflows and scrolls
- a few widths: mobile (~390px), the responsive breakpoint boundary (768px
  in this app), and desktop (~1440px)

This isn't paranoia — it's how a real regression got caught mid-fix in this
codebase: reserving space more precisely for a mutation card broke the
welcome screen's vertical centering, because both share `.chat-viewport`.
Only the regression pass caught it before it shipped.

## Clean up every time

```bash
bash .claude/skills/layout-check/scripts/teardown.sh
rm -f .claude/skills/e2e-chat/scripts/*.tmp.mjs
```

Confirm the ports are actually free (`teardown.sh` does this and exits
non-zero if not) and that no `.tmp.mjs` script is left behind to get
accidentally committed.
