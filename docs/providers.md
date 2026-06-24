# Providers

Custom integrations in `src/providers/`, registered at agent startup via `registerProvider` / `registerApiProvider` from `@flue/runtime`.

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
- Assistant messages carry only their text content — `tool_calls` is stripped
- Tool results are sent as `role: "user"` with content `[Tool result]\n<json>`

### Model ID format

`catalyst-glm/<model-id>` — e.g. `catalyst-glm/crm-di-glm47b_30b_it`

### Token refresh

`registerCatalystGLM` stores the OAuth credentials. On a 401 response the provider calls `getZohoAccessToken` once to refresh the token and retries automatically.

---

## `zoho-auth.ts`

Exchanges `ZOHO_OAUTH_REFRESH_TOKEN` for a live Zoho access token via:

```
POST https://accounts.zoho.com/oauth/v2/token
  grant_type=refresh_token
```

Called at agent module load (top-level `await`) — token is always fresh on startup, never static.

See [environment.md](environment.md) for the required env variables and [setup.md](setup.md) for how to obtain them.
