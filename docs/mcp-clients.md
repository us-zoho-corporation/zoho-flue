# MCP Clients

Programmatic MCP server connections in `src/mcp/`. Use `@modelcontextprotocol/sdk` v1 `Client` directly rather than Flue's `useMcpConnection`. Reason: raw MCP tool schemas (including `outputSchema`, `$defs`, `anyOf`, `$ref`) are more than the app wants to pass straight through to the model — manual `defineTool` wrappers with simplified Valibot schemas keep the shape predictable and small.

## Clients

| Client | Server | Tools |
|---|---|---|
| zoho-kb | `help-docs.zoho-forge.com/mcp` | [tools](mcp/clients/zoho-kb/tools.md) |

## Connection pattern

Each client uses a singleton `Client` instance (lazily initialised) with a single retry on failure before propagating the error.

## User-connected MCP servers

Signed-in users can connect their own external MCP servers (managed under **Workspace → MCP servers**). These are per-user records in the store (`McpServerStore`; Catalyst `McpServers` table), with the auth token encrypted at rest (`src/auth/crypto.ts`) and never returned to the client.

- CRUD + test API: `src/mcp/routes.ts` (`/api/mcp-servers`, behind `requireUser`).
- Connect/probe helper: `src/mcp/connect.ts` — `probeMcpServer` (list tools) and `callMcpTool` (invoke a tool) connect via Streamable HTTP or SSE. Both go through `openClient`, which enforces the SSRF guard: `validateMcpUrl` (https-only, internal names, literal private IPs) **and** DNS resolution rejecting any address that is loopback/private/link-local/ULA/IPv4-mapped-private, plus `redirect: 'error'` transports.
- **Live tool injection.** `assistantMiddleware` (`src/agents/assistant.ts`) loads the logged-in user's *enabled* servers via `loadUserMcpTools` (`src/mcp/live.ts`, tool discovery cached ~5 min) and records the built tools in the per-conversation `TurnContext` (`src/auth/request-context.ts`); `Assistant`'s render reads them back out via `currentTurnContext` and mounts each with `useTool` for that turn. `src/mcp/tools.ts` wraps each remote tool with `defineTool`, converting its JSON Schema to a **shallow** Valibot schema (top-level primitives; complex shapes flattened to `any`) so the schema the model sees stays simple — no `$ref`/`$defs`/`anyOf`/`outputSchema`.
