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
- Connect/probe helper: `src/mcp/connect.ts` — `probeMcpServer({ url, transport, authToken })` connects (Streamable HTTP or SSE) and `listTools()`; used by the "Test connection" action. Includes an SSRF guard (`validateMcpUrl`: https-only, blocks loopback/private hosts).
- **Not yet wired into the agent.** Injecting a user's connected tools into the assistant at runtime is deferred: Flue supports it via a `SessionToolFactory`, but Catalyst GLM rejects raw MCP tool schemas (`PATTERN_NOT_MATCHED`), so those tools would need per-tool schema simplification (as the zoho-kb `defineTool` wrappers do) before they're safe for GLM.
