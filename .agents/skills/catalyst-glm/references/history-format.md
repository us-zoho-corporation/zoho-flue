# GLM History Format — Full Specification

Source: `src/providers/catalyst-glm.ts` → `convertMessages`.

## Message types accepted by GLM

| Role | Allowed fields | Notes |
|---|---|---|
| `system` | `role`, `content` | Standard |
| `user` | `role`, `content` | Standard |
| `assistant` | `role`, `content` | `tool_calls` MUST be stripped |

## Tool result conversion

Incoming tool result messages (`role: "toolResult"`) are converted to a `user` message with
explicit delimiters so the model recognises them as tool output rather than a user turn:

```json
{
  "role": "user",
  "content": "[TOOL_RESULT_START id=\"<toolCallId>\"]\n<tool output text>\n[TOOL_RESULT_END]"
}
```

## Fields that trigger EXTRA_KEY_FOUND_IN_JSON

GLM validates the message array strictly. Any of these cause the error:

- `"tool_calls"` key present on any message
- `"role": "tool"` in any message
- `"tool_call_id"` on any message
- Any other non-standard key not in `{ role, content }`
