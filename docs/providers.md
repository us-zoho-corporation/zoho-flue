# Providers

Every **model provider** (in the Flue sense — `registerProvider` / `registerApiProvider`) lives in `src/providers/` and is wired in through one `registerProviders()` call (`src/providers/index.ts`) that `src/app.ts` invokes at startup. Provider setup belongs here, not in agent modules — Flue loads `app.ts` in every run mode, so providers are registered before any agent resolves its model.

Credential/OAuth helpers are **not** providers; they live in `src/auth/` (see [architecture.md](architecture.md) → Auth).

| File | Provider |
|---|---|
| `index.ts` | `registerProviders()` — registers all of the below |
| `catalyst-glm.ts` | Zoho Catalyst QuickML GLM (custom `registerApiProvider` adapter) |
| `anthropic.ts` | Anthropic Claude (built-in Flue provider; credential-only) |

## `catalyst-glm.ts`

Wraps Zoho Catalyst's QuickML GLM endpoint as a Flue API provider.

### Response format

Catalyst GLM does **not** use OpenAI's `choices[]` envelope. Its response is flat:

```json
{
  "response": "text content",
  "tool_calls": [{ "id": "...", "type": "function", "function": { "name": "...", "arguments": "..." } }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

- `response` — assistant text (may be present alongside tool calls)
- `tool_calls` — top-level array, not nested in `choices[0].message`

### History format (critical)

When sending multi-turn history back, Catalyst GLM rejects unrecognised keys with `EXTRA_KEY_FOUND_IN_JSON`. Do **not** include:

- `tool_calls` on assistant messages
- `role: "tool"` messages
- `tool_call_id` on any message

**Workaround (already implemented in `convertMessages`):**
- Assistant messages carry only their text content — `tool_calls` is stripped. It does **not**
  echo a synthetic `[tool_call …]` line either; a weak model imitates that and emits tool calls
  as prose instead of real calls.
- Tool results are sent as `role: "user"` with content
  `[TOOL_RESULT_START tool="<toolName>" id="<toolCallId>"]\n<content>\n[TOOL_RESULT_END]`.
  Naming the tool lets the model correlate the result with its own call (stops re-search loops);
  forged `[TOOL_RESULT_*]` tokens in `<content>` are neutralized.

`convertMessages` does wire-format translation only — it does not truncate history. Context
size is managed by Flue's built-in compaction, which `registerCatalystGLM` enables by passing
`contextWindow` (`config.catalystContextWindow`, 200k).

**Tolerant tool-call parsing:** the response handler never throws on a malformed/truncated
`arguments` JSON — it emits the call with `{}` args so Flue's schema validation returns a
recoverable tool error the model can retry, rather than aborting the whole turn.

### Model ID format

`catalyst-glm/<model-id>` — e.g. `catalyst-glm/crm-di-glm47b_30b_it`

### Token refresh

`registerCatalystGLM` stores the OAuth credentials. On a 401 response the provider calls `getZohoAccessToken` once to refresh the token and retries automatically.

---

## `anthropic.ts`

Anthropic Claude is one of Flue's **built-in catalog providers**, so it needs no `registerApiProvider` — only `ANTHROPIC_API_KEY`. `registerAnthropic()` is its declared home (mirroring `catalyst-glm.ts`): it fails fast at startup if an `anthropic/*` model is offered in `config.chatModels` without a key, then layers that key onto the catalog provider via `registerProvider('anthropic', { apiKey })`.

---

Zoho OAuth token exchange used to live here but is **not a provider** — it moved to `src/auth/zoho-auth.ts`. See [architecture.md](architecture.md) → Auth, and the `zoho-oauth` skill for the credential flow. It is consumed here by `catalyst-glm.ts` for the provider's bearer token.
