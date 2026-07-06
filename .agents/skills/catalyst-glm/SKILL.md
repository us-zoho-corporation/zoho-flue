---
name: catalyst-glm
description: Debug or implement against the Zoho Catalyst GLM provider in this project. Use when working on src/providers/catalyst-glm.ts, handling GLM response parsing, fixing EXTRA_KEY_FOUND_IN_JSON errors, understanding why tool results are sent as user messages, or troubleshooting token refresh.
allowed-tools: Read
---

## Critical gotcha: EXTRA_KEY_FOUND_IN_JSON

Catalyst GLM validates message history strictly and rejects any non-standard keys with `EXTRA_KEY_FOUND_IN_JSON`. Never include in history sent to GLM:

- `tool_calls` on any message (including assistant turns)
- `role: "tool"` messages
- `tool_call_id` on any message

**Workaround already in `convertMessages` (`src/providers/catalyst-glm.ts`):**
- Assistant messages: `tool_calls` is stripped, only text content is kept (the empty
  assistant turn is still emitted so the conversation structure stays intact). Do **not**
  echo a synthetic `[tool_call …]` line into the assistant content — a weak model imitates
  it and starts emitting tool calls as prose. Coherence comes from the result naming the tool.
- Tool results: converted to `role: "user"` with content
  `[TOOL_RESULT_START tool="<toolName>" id="<toolCallId>"]\n<content>\n[TOOL_RESULT_END]`.
  Naming the tool lets the model correlate the result with its own call (this is what keeps
  it from re-searching in a loop). Forged `[TOOL_RESULT_*]` tokens inside `<content>` are
  neutralized so model/web content can't fake a tool boundary.

`convertMessages(context)` does only this wire-format translation. It does NOT truncate
history (Flue's built-in compaction handles context — see below), gate tool calls, or
post-process the model's response text.

## Tolerant tool-call parsing

A tool call's `arguments` string can be malformed or truncated (e.g. a large a2ui spec cut
off by `max_tokens`). The response handler must **never throw** on `JSON.parse` — that would
abort the whole turn. On a parse failure it emits the call with `{}` args, so Flue's tool
schema validation returns a *recoverable* tool error the model can react to and retry.

## Response format

GLM response is flat — not wrapped in `choices[]`:

```json
{
  "response": "text content",
  "tool_calls": [{ "id": "...", "type": "function", "function": { "name": "...", "arguments": "..." } }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

`response` and `tool_calls` may both be present in a single turn.

## Model ID format

`catalyst-glm/<model-id>` — e.g. `catalyst-glm/crm-di-glm47b_30b_it` (set in `src/config.ts`).

## Registration & context

`registerCatalystGLM(...)` is called from `registerProviders()` in `src/providers/index.ts` (invoked once from `app.ts`, not from agent modules). It passes
`contextWindow: config.catalystContextWindow` (200k) so Flue's built-in compaction triggers on
its own — there is no manual history truncation in the provider.

## Token refresh

On a 401, the provider calls `getZohoAccessToken` once and retries automatically. Persistent 401s indicate bad `ZOHO_OAUTH_*` credentials in `.env`.

---

Read `references/history-format.md` if you need the full message conversion spec or are debugging a specific history-related error.
