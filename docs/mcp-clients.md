# MCP Clients

Programmatic MCP server connections in `src/mcp/`. Use `@modelcontextprotocol/sdk` v1 `Client` directly rather than Flue's `connectMcpServer`. Reason: `connectMcpServer` passes raw MCP tool schemas (including `outputSchema`, `$defs`, `anyOf`, `$ref`) to the LLM — Catalyst GLM rejects these with `PATTERN_NOT_MATCHED`. Manual `defineTool` wrappers with simplified Valibot schemas are required instead.

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
- **Live tool injection.** The assistant `route` (`src/agents/assistant.ts`) loads the logged-in user's *enabled* servers via `loadUserMcpTools` (`src/mcp/live.ts`, tool discovery cached ~5 min) and stashes the built tools in the request-context ALS; the `defineAgent` factory appends them to the profile for that conversation. `src/mcp/tools.ts` wraps each remote tool with `defineTool`, converting its JSON Schema to a **shallow** Valibot schema (top-level primitives; complex shapes flattened to `any`) so the schema stays simple enough for Catalyst GLM (which rejects `$ref`/`$defs`/`anyOf`/`outputSchema`).
