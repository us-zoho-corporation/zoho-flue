---
name: zoho-kb-mcp
description: Work with the Zoho Knowledge Base MCP client in this project. Use when adding or debugging KB tools in src/mcp/zoho-kb.ts, understanding why defineTool wrappers are used instead of useMcpConnection, or inspecting zoho_kb_search / zoho_kb_get_page / zoho_kb_list_products tool definitions.
allowed-tools: Read
---

## Why direct SDK, not useMcpConnection

Flue's `useMcpConnection` mounts a remote MCP server's raw tool schemas (including `outputSchema`, `$defs`, `anyOf`, `$ref`) straight through to the model. This project instead wraps each KB tool manually, so the schema the model sees stays simple and predictable regardless of which model is selected.

`src/mcp/zoho-kb.ts` instead:
1. Wraps each MCP call with `defineTool` using simplified Valibot input schemas
2. Enforces an allowlist (`ALLOWED_MCP_TOOLS`) — only `search_docs`, `get_page`, `list_products` are callable
3. Authenticates per call as the calling user (see below) — no shared, app-wide credential

## Connection pattern — per-user OAuth, no shared client

The docs MCP server (`help-docs.zoho-forge.com`) runs its own OAuth 2.1 authorization
server (PKCE), separate from `accounts.zoho.com` — see `src/auth/docs-oauth.ts` and
`docs/auth.md#docs-knowledge-base-connection`. `defineZohoKbTools({ userId, getDocsToken })`
is called fresh per turn (in `Assistant`'s render, `src/agents/assistant.ts`), and each
tool call:

1. Resolves the calling user's own access token via `getDocsToken(userId)` — throwing a
   `ConnectionRequiredPayload` (`kind: 'docs'`, `mode: 'connect'` or `'reconnect'`) if the
   user has no token or a dead refresh token, exactly like `zoho_api`'s Zoho connection gate.
2. Opens a short-lived `@modelcontextprotocol/sdk` `Client` for just that one call, with
   that user's bearer token, and closes it afterward — there is no shared, process-wide
   client, since the token is per user.

There's no bearer token to re-issue by hand: a stale/dead connection surfaces as a
Connect/Reconnect card in the chat (same UX as a Zoho product connection), and the user
reconnects from Settings.

## Result truncation

Results are truncated at 12,000 characters — compaction handles longer conversations, but one unbounded blob still wastes the model's context in a single tool call, so it's capped once here.

## Adding a new KB tool

1. Add the MCP tool name to `ALLOWED_MCP_TOOLS`.
2. Write a `defineTool` wrapper with simplified Valibot input/output schemas (`v.any()` output is fine).
3. Return it from `defineZohoKbTools()`.

---

Read `references/tools.md` for the current tool definitions, input schemas, and MCP tool name mappings.
