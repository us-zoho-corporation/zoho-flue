# a2ui — generative UI streaming

a2ui lets the agent present answers as rich, streamed visualizations — charts, comparison tables, and metric cards — rendered with [Kumo](https://github.com/cloudflare/kumo) UI and [Apache ECharts](https://echarts.apache.org) (both open source) instead of plain Markdown.

## How it works

There is no separate UI transport. a2ui rides on Flue's existing tool-call stream:

1. The agent calls an **a2ui tool** (`render_chart`, `render_comparison_table`, `render_stat_cards`). The visualization spec is the tool's **input** — authored by the model.
2. Flue streams that tool call to the browser as a `dynamic-tool` message part, so the input arrives incrementally as the model generates tokens.
3. The frontend reads the streaming input and renders the matching component. While the spec is still partial it shows a labeled skeleton; it swaps to the real surface as soon as enough data has arrived.
4. Each tool's `run` returns only a small acknowledgement — the tools have no side effects; their purpose is purely presentational.

Because the spec lives in the tool input, the chart or table **builds live** while the model streams, and it persists as part of the durable transcript afterward.

## Backend — `src/tools/a2ui.ts`

`a2uiTools` exports three Valibot-schema tools, spread into the assistant's `tools` in `src/agents/assistant.ts`. The instructions tell it when to reach for each:

| Tool | Use for | Spec shape (input) |
|---|---|---|
| `render_chart` | comparisons (`bar`), trends (`line`/`area`), parts-of-whole (`pie`) | `chartType`, `categories`, `series[]`, optional `title`/`stacked`/axis labels |
| `render_comparison_table` | comparing items across the same attributes | `columns[]`, `rows[][]`, optional `highlightColumn`/`caption` |
| `render_stat_cards` | headline KPIs with change indicators | `cards[]` of `{ label, value, delta?, trend?, help? }` |

## Frontend — `src/chat/src/a2ui/`

| File | Purpose |
|---|---|
| `spec.ts` | Tolerant normalizers (`parseChartSpec` etc.) that return `pending` until a streaming spec is renderable, then `ready`. Also `isA2uiTool()`. |
| `A2uiPart.tsx` | Dispatches a streaming tool part to the right renderer. |
| `A2uiChart.tsx` | Builds an ECharts option from a `ChartSpec` and renders Kumo's `Chart`. |
| `A2uiTable.tsx` | Renders a comparison table with Kumo's `Table`. |
| `A2uiStatCards.tsx` | Renders KPI cards. |
| `Frame.tsx` | Shared title/caption chrome and the pending skeleton. |

The view model (`flue-model.ts`) collapses each assistant turn into one entry, splitting tool calls into **steps** (non-a2ui tools) and **`uiParts`** (a2ui tools). `Thread.tsx`'s `AssistantTurn` renders one continuous turn: the steps on top (a live work panel while running, a collapsible chip in place once done), then the answer text, then `uiParts` inline beneath it. Nothing teleports between the running and finished states.

## Tests

- `src/chat/src/a2ui/spec.test.ts` — unit tests for the normalizers, including partial/streaming inputs (`pnpm test`).
- `src/chat/src/a2ui/A2uiPart.browser.test.tsx` — renders each surface in headless Chromium (`pnpm test:browser`).

## Notes

- `echarts` is a Kumo peer dependency; it is installed directly and passed to Kumo's `Chart` via the `echarts` prop. To trim bundle size later, import only the needed ECharts modules from `echarts/core` and register them with `echarts.use(...)`.
- Renderers are defensive by design: malformed or missing fields degrade to a skeleton rather than throwing, since the spec is model-authored and streamed. As a backstop, `A2uiPart` wraps each surface in an error boundary — a spec that slips past the normalizers and throws at render time (e.g. inside ECharts) degrades to a "couldn't render" notice instead of crashing the chat.
- A visualization spec is a sizeable tool-call JSON. Keep the model's output budget high enough (`config.catalystMaxTokens`) that the spec **and** the written takeaway fit in one turn — too low a cap truncates the reply mid-stream.
