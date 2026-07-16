# a2ui — generative UI streaming

a2ui lets the agent present answers as rich, streamed visualizations — charts, comparison tables, metric cards, and single-record detail cards — rendered with [Kumo](https://github.com/cloudflare/kumo) UI, [Apache ECharts](https://echarts.apache.org) (both open source), and this app's own glass-themed components instead of plain Markdown.

## How it works

There is no separate UI transport. a2ui rides on Flue's existing tool-call stream:

1. The agent calls an **a2ui tool** (`render_chart`, `render_comparison_table`, `render_stat_cards`, `render_record_card`). The visualization spec is the tool's **input** — authored by the model.
2. Flue streams that tool call to the browser as a `dynamic-tool` message part, so the input arrives incrementally as the model generates tokens.
3. The frontend reads the streaming input and renders the matching component. While the spec is still partial it shows a labeled skeleton; it swaps to the real surface as soon as enough data has arrived.
4. Each tool's `run` returns only a small acknowledgement — the tools have no side effects; their purpose is purely presentational.

Because the spec lives in the tool input, the chart or table **builds live** while the model streams, and it persists as part of the durable transcript afterward.

## Backend — `src/tools/a2ui.ts`

`a2uiTools` exports four Valibot-schema tools, spread into the assistant's `tools` in `src/agents/assistant.ts`. The instructions tell it when to reach for each:

| Tool | Use for | Spec shape (input) |
|---|---|---|
| `render_chart` | comparisons (`bar`), trends (`line`/`area`), parts-of-whole (`pie`) | `chartType`, `categories`, `series[]`, optional `title`/`stacked`/axis labels |
| `render_comparison_table` | comparing items across the same attributes | `columns[]`, `rows[][]`, optional `highlightColumn`/`caption` |
| `render_stat_cards` | headline KPIs with change indicators | `cards[]` of `{ label, value, delta?, trend?, help? }` |
| `render_record_card` | a single record's own field values — confirming a create/update, or previewing one looked up | `title`, optional `subtitle`/`status` (`"success"` \| `"neutral"`), `fields[]` of `{ label, value }` |

The assistant's instructions carry a "never show the same values twice" rule: whenever a visualization (including `render_record_card`) renders a set of values, the model's own written reply must not restate them — one short interpretive line instead. This applies to `propose_mutation`'s and `propose_mutation_batch`'s confirmation cards too (see below).

## Frontend — `src/chat/src/a2ui/`

| File | Purpose |
|---|---|
| `spec.ts` | Tolerant normalizers (`parseChartSpec`, `parseRecordCardSpec`, etc.) that return `pending` until a streaming spec is renderable, then `ready`. Also `isA2uiTool()`. |
| `A2uiPart.tsx` | Dispatches a streaming tool part to the right renderer. |
| `A2uiChart.tsx` | Builds an ECharts option from a `ChartSpec` and renders Kumo's `Chart`. |
| `A2uiTable.tsx` | Renders a comparison table with Kumo's `Table`. |
| `A2uiStatCards.tsx` | Renders KPI cards. |
| `A2uiRecordCard.tsx` | Renders a single record's fields as a glass-themed card (this app's own styling, not Kumo's `LayerCard`) — a compact label/value row per short field, a full-width block per long one (e.g. a Description). |
| `Frame.tsx` | Shared title/caption chrome and the pending skeleton. |

The view model (`flue-model.ts`) collapses each assistant turn into one entry, splitting tool calls into **steps** (non-a2ui tools) and **`uiParts`** (a2ui tools). `Thread.tsx`'s `AssistantTurn` renders one continuous turn: the steps on top (a live work panel while running, a collapsible chip in place once done), then the answer text, then `uiParts` inline beneath it. Nothing teleports between the running and finished states.

## Reusing `A2uiRecordCard` outside a real `render_record_card` call

Two flows in `Thread.tsx` reuse `A2uiRecordCard` for data that never actually went through the `render_record_card` tool, so the same "structured info is a card, not text" treatment applies consistently everywhere it's shown:

- **`propose_mutation` preview** — `AssistantTurn`'s `mutationCards` synthesizes an `A2uiPart` with `toolName: 'render_record_card'` directly from `propose_mutation`'s own input (`action` → `title`, `fields` passed straight through), so the proposed record's fields render as a card without the model needing to call `render_record_card` a second time for data it already sent once.
- **Submitted `request_input` form** — when a user message immediately follows an assistant turn whose last tool step was `request_input`, `formSubmissionCardFor` reconstructs the filled-in `label: value` pairs from the message's plain text (the same text actually sent to the model — see below) and matches them against that `request_input` call's real field list. If every line matches a real field, `UserMessage` renders an `A2uiRecordCard` instead of the plain bubble; if the text doesn't cleanly match (e.g. the user typed a free-text reply instead of using the form), it falls back to the plain bubble. This only affects *display* — the wire message is unchanged either way.

A third flow, `propose_mutation_batch`'s preview, follows the same "synthesize from the tool's own input, don't ask the model to repeat itself" idea but renders through a purpose-built `MutationSequenceCard` instead of `A2uiRecordCard` — one card holding a numbered step per action (each with its own field rows), so an approved batch reads as one ordered operation rather than several unrelated record cards stacked by coincidence of layout.

## `request_input` — interactive forms (not a display-only a2ui tool)

`src/tools/request-input.ts` defines `request_input`, spread into the assistant's static tools alongside `a2uiTools`. Unlike the tools above, it isn't in `A2UI_TOOL_NAMES` and doesn't stream a read-only spec — the model calls it when it needs specific information from the user (required fields it doesn't have, or an exact value only the user can supply) instead of asking in prose. Its input is `{ prompt, fields: [{ label, type, options?, placeholder?, defaultValue?, required }] }`, where `type` is `'text' | 'textarea' | 'date' | 'number' | 'select'` — the model is instructed to ground `required` and `type` in real field metadata (e.g. CRM's Get Layouts) rather than guessing, and to pre-fill `defaultValue` with a real suggestion when it has one.

`src/chat/src/formRequest.ts` normalizes the tool call into a `FormRequestSpec` (`parseFormRequest`) and reconstructs a submitted form's fields back out of the plain-text reply (`matchFormSubmission`, used by `formSubmissionCardFor` above). `Thread.tsx`'s `FormRequestCard` renders the actual inputs — a native `<input type="date">`/`<input type="number">`/`<select>` per field's `type`, pre-filled from `defaultValue` — and on submit composes the filled values into a single plain-text reply (`Label: value` per non-empty line) sent as an ordinary user message, exactly like `MutationApprovalCard`'s Approve/Deny buttons. The backend never needs to know a form was involved.

## Tests

- `src/chat/src/a2ui/spec.test.ts` — unit tests for the normalizers, including partial/streaming inputs (`pnpm test`).
- `src/chat/src/a2ui/A2uiPart.browser.test.tsx` — renders each surface in headless Chromium (`pnpm test:browser`).
- `src/chat/src/formRequest.test.ts` — `parseFormRequest`/`matchFormSubmission` unit tests.
- `src/tools/request-input.test.ts` — the `request_input` tool itself.

## Notes

- `echarts` is a Kumo peer dependency; it is installed directly and passed to Kumo's `Chart` via the `echarts` prop. To trim bundle size later, import only the needed ECharts modules from `echarts/core` and register them with `echarts.use(...)`.
- Renderers are defensive by design: malformed or missing fields degrade to a skeleton rather than throwing, since the spec is model-authored and streamed. As a backstop, `A2uiPart` wraps each surface in an error boundary — a spec that slips past the normalizers and throws at render time (e.g. inside ECharts) degrades to a "couldn't render" notice instead of crashing the chat.
- A visualization spec is a sizeable tool-call JSON. Keep the model's output budget high enough (`config.catalystMaxTokens`) that the spec **and** the written takeaway fit in one turn — too low a cap truncates the reply mid-stream.
