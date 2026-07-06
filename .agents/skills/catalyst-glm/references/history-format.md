# GLM History Format — Full Specification

Source: `src/providers/catalyst-glm.ts` → `convertMessages`.

## Message types accepted by GLM

| Role | Allowed fields | Notes |
|---|---|---|
| `system` | `role`, `content` | Standard |
| `user` | `role`, `content` | Standard |
| `assistant` | `role`, `content` | `tool_calls` MUST be stripped |

## Assistant turns

Only the model's own text is sent back. Native `tool_calls` are dropped, and we deliberately
do **not** substitute a synthetic `[tool_call …]` line — echoing tool-call syntax into history
teaches a weak model to emit tool calls as prose instead of real calls. The empty assistant
turn is still emitted so the conversation structure stays intact.

## Tool result conversion

Incoming tool result messages (`role: "toolResult"`) are converted to a `user` message with
explicit delimiters so the model recognises them as tool output rather than a user turn. The
delimiter names the tool (so the model can correlate the result with its own call — the key to
stopping redundant re-searching), and any forged `[TOOL_RESULT_*]` tokens inside the content
are neutralized:

```json
{
  "role": "user",
  "content": "[TOOL_RESULT_START tool=\"<toolName>\" id=\"<toolCallId>\"]\n<tool output text>\n[TOOL_RESULT_END]"
}
```

## Fields that trigger EXTRA_KEY_FOUND_IN_JSON

GLM validates the message array strictly. Any of these cause the error:

- `"tool_calls"` key present on any message
- `"role": "tool"` in any message
- `"tool_call_id"` on any message
- Any other non-standard key not in `{ role, content }`
