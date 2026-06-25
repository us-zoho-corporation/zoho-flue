# zoho-kb Tool Definitions

Source: `src/mcp/zoho-kb.ts`
MCP server: `https://help-docs.zoho-forge.com/mcp`
Requires: `ZOHO_DOCS_BEARER_TOKEN` in `.env` (see `zoho-oauth` skill)

## zoho_kb_search

Wraps MCP tool `search_docs`.

| Input | Type | Required | Notes |
|---|---|---|---|
| `query` | string | Yes | Natural language search query |
| `products` | string | No | Comma-separated product slugs, e.g. `"zoho-crm,zoho-desk"` |
| `top_k` | number | No | Results to return (1–20, default 5) |

Output schema: `v.any()` — response shape varies.

## zoho_kb_get_page

Wraps MCP tool `get_page`.

| Input | Type | Required | Notes |
|---|---|---|---|
| `url` | string | Yes | Exact page URL from a `zoho_kb_search` result |
| `max_chars` | number | No | Max chars to return (default 6000, max 20000) |

## zoho_kb_list_products

Wraps MCP tool `list_products`. No inputs. Returns all Zoho documentation products with article counts and their slugs.

## Output schema note

All three tools use `v.any()` as output schema. The KB server returns varied JSON shapes that would require complex Valibot schemas to type fully. Catalyst GLM accepts `v.any()` without issues.
