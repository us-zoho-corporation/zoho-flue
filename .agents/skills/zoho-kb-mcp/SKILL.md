---
name: zoho-kb-mcp
description: Work with the Zoho Knowledge Base MCP client in this project. Use when adding or debugging KB tools in src/mcp/zoho-kb.ts, understanding why defineTool wrappers are used instead of useMcpConnection, or inspecting zoho_kb_search / zoho_kb_get_page / zoho_kb_list_products tool definitions.
allowed-tools: Read
---

## Why direct SDK, not useMcpConnection

Flue's `useMcpConnection` mounts a remote MCP server's raw tool schemas (including `outputSchema`, `$defs`, `anyOf`, `$ref`) straight through to the model. This project instead wraps each KB tool manually, so the schema the model sees stays simple and predictable regardless of which model is selected.

`src/mcp/zoho-kb.ts` instead:
1. Holds a singleton `@modelcontextprotocol/sdk` `Client` instance (lazy, one retry on failure)
2. Wraps each MCP call with `defineTool` using simplified Valibot input schemas
3. Enforces an allowlist (`ALLOWED_MCP_TOOLS`) — only `search_docs`, `get_page`, `list_products` are callable

## Connection pattern

```typescript
const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${config.zohoDocsBearerToken}` } },
    }),
);
```

The bearer token (`config.zohoDocsBearerToken`) is sent as-is — the client does not validate or refresh it. On a failed call it retries once, then propagates the error; if the token has expired, re-issue it (see the `zoho-oauth` skill).

## Result truncation

Results are truncated at 12,000 characters — compaction handles longer conversations, but one unbounded blob still wastes the model's context in a single tool call, so it's capped once here.

## Adding a new KB tool

1. Add the MCP tool name to `ALLOWED_MCP_TOOLS`.
2. Write a `defineTool` wrapper with simplified Valibot input/output schemas (`v.any()` output is fine).
3. Export it in `zohoKbTools`.

---

Read `references/tools.md` for the current tool definitions, input schemas, and MCP tool name mappings.
