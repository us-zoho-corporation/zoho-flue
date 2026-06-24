# MCP Clients

Programmatic MCP server connections in `src/mcp/`. Use `@modelcontextprotocol/sdk` v1 `Client` directly rather than Flue's `connectMcpServer`. Reason: `connectMcpServer` passes raw MCP tool schemas (including `outputSchema`, `$defs`, `anyOf`, `$ref`) to the LLM — Catalyst GLM rejects these with `PATTERN_NOT_MATCHED`. Manual `defineTool` wrappers with simplified Valibot schemas are required instead.

## Clients

| Client | Server | Tools |
|---|---|---|
| zoho-kb | `help-docs.zoho-forge.com/mcp` | [tools](mcp/clients/zoho-kb/tools.md) |

## Connection pattern

Each client uses a singleton `Client` instance (lazily initialised) with a single retry on failure before propagating the error.
