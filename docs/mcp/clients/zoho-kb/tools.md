# zoho-kb Tools

Source: `src/mcp/zoho-kb.ts`  
MCP server: `https://help-docs.zoho-forge.com/mcp`  
Requires: `ZOHO_DOCS_TOKEN` (see [setup.md](../../../setup.md))

| Tool | MCP tool | Required inputs | Optional inputs |
|---|---|---|---|
| `zoho_kb_search` | `search_docs` | `query` | `products` (comma-separated slugs), `top_k` (1–20) |
| `zoho_kb_get_page` | `get_page` | `url` | `max_chars` (default 6000, max 20000) |
| `zoho_kb_list_products` | `list_products` | — | — |

All tools use `v.any()` as output schema — the KB server returns varied JSON shapes.
