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
- Assistant messages: `tool_calls` is stripped, only text content is kept
- Tool results: converted to `role: "user"` with content `[Tool result]\n<json>`

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

## Token refresh

On a 401, the provider calls `getZohoAccessToken` once and retries automatically. Persistent 401s indicate bad `ZOHO_OAUTH_*` credentials in `.env`.

---

Read `references/history-format.md` if you need the full message conversion spec or are debugging a specific history-related error.
