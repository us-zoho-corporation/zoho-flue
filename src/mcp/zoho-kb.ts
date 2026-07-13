import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';

const MCP_URL = 'https://help-docs.zoho-forge.com/mcp';

// Allowlist of MCP tool names this client is permitted to call.
const ALLOWED_MCP_TOOLS = new Set(['search_docs', 'get_page', 'list_products']);

let _client: Client | null = null;

/**
 * Returns the cached MCP client connection to the Zoho docs server, creating
 * and connecting a new one over Streamable HTTP (authenticated with the
 * configured bearer token) if none exists yet.
 * @returns A connected MCP `Client` for the Zoho docs server.
 * @throws {Error} If the connection to the MCP server fails.
 */
async function getClient(): Promise<Client> {
    if (_client) return _client;
    const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
    await client.connect(
        new StreamableHTTPClientTransport(new URL(MCP_URL), {
            requestInit: { headers: { Authorization: `Bearer ${config.zohoDocsBearerToken}` } },
        }),
    );
    _client = client;
    return client;
}

/**
 * Closes and discards the cached MCP client connection so the next call to
 * `getClient` establishes a fresh one. Any error while closing the stale
 * connection is swallowed, since the connection is being discarded anyway.
 */
async function resetClient(): Promise<void> {
    try { await _client?.close(); } catch { /* ignore */ }
    _client = null;
}

// Single overall cap on tool output. Compaction handles longer conversations,
// but one unbounded blob still wastes the model's context, so cap it once.
const MAX_RESULT_CHARS = 12_000;

/**
 * Formats one parsed result object as readable lines: `Title:`/`URL:` (using
 * `deep_link` over `url` when present, since the KB's `quality_hint` asks
 * callers to cite `deep_link`), then the body (`chunk_text`, `content`, or
 * `excerpt` — whichever is present). Falls back to the raw JSON for shapes
 * with none of those fields (e.g. `list_products`' per-product objects), so
 * data is never silently dropped.
 * @param obj - A single parsed result object.
 * @returns The formatted lines, or `obj`'s raw JSON if it has no recognized field.
 */
function formatResult(obj: Record<string, unknown>): string {
    const lines: string[] = [];
    if (obj.title) lines.push(`Title: ${String(obj.title)}`);
    const link = obj.deep_link ?? obj.url;
    if (link) lines.push(`URL: ${String(link)}`);
    const body = typeof obj.chunk_text === 'string' ? obj.chunk_text
        : typeof obj.content === 'string' ? obj.content
        : typeof obj.excerpt === 'string' ? obj.excerpt : '';
    if (body) lines.push(String(body));
    return lines.length ? lines.join('\n') : JSON.stringify(obj);
}

/**
 * Extracts a readable plain-text view of MCP result content. Each content
 * block's `text` is parsed as JSON: `search_docs` wraps its hits in a
 * `results` array alongside a top-level `confidence`/`top_score`/
 * `quality_hint` (each hit formatted via {@link formatResult}, prefixed with
 * that confidence signal so the model can calibrate); other tools return one
 * result object per block, formatted directly. Text that isn't JSON is
 * passed through unchanged. Multiple blocks are joined with a separator, and
 * the combined output is capped at `MAX_RESULT_CHARS`.
 * @param content - The MCP tool result's `content` field (expected to be an array of content blocks, but handled defensively otherwise).
 * @returns The formatted, length-capped plain-text representation of `content`.
 */
export function extractText(content: unknown): string {
    if (!Array.isArray(content)) return String(content).slice(0, MAX_RESULT_CHARS);
    const parts: string[] = [];
    for (const block of content) {
        if (typeof block !== 'object' || block === null || !('text' in block)) continue;
        const raw = (block as { text: string }).text;
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (Array.isArray(parsed.results)) {
                const confidence = parsed.confidence ? `Confidence: ${String(parsed.confidence)}` : '';
                const hint = parsed.quality_hint ? String(parsed.quality_hint) : '';
                const preamble = [confidence, hint].filter(Boolean).join(' — ');
                if (preamble) parts.push(preamble);
                for (const hit of parsed.results as unknown[]) {
                    if (hit && typeof hit === 'object') parts.push(formatResult(hit as Record<string, unknown>));
                }
                continue;
            }
            parts.push(formatResult(parsed));
        } catch {
            parts.push(raw);
        }
    }
    const joined = parts.join('\n\n---\n\n');
    return joined.length <= MAX_RESULT_CHARS ? joined : joined.slice(0, MAX_RESULT_CHARS) + '\n[truncated]';
}

/**
 * Invokes an allowlisted MCP tool on the Zoho docs server, transparently
 * resetting the client connection and retrying once if the first attempt
 * fails (e.g. due to a stale connection).
 * @param name - The MCP tool name to call; must be in `ALLOWED_MCP_TOOLS`.
 * @param args - The arguments to pass to the tool.
 * @returns A single-element text content array with the formatted tool output.
 * @throws {Error} If `name` is not in `ALLOWED_MCP_TOOLS`, or if the retried call to the MCP server also fails.
 */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_MCP_TOOLS.has(name)) {
        throw new Error(`MCP tool call blocked: '${name}' is not an allowed tool.`);
    }
    let client = await getClient();
    let result;
    try {
        result = await client.callTool({ name, arguments: args });
    } catch {
        await resetClient();
        client = await getClient();
        result = await client.callTool({ name, arguments: args });
    }
    return [{ type: 'text', text: extractText(result.content) }];
}

const searchDocs = defineTool({
    name: 'zoho_kb_search',
    description: 'Search the Zoho knowledge base. Use this before answering any question about Zoho product features, configuration, APIs, or troubleshooting — prefer sourced answers over memory.',
    input: v.object({
        query: v.string(),
        products: v.optional(v.pipe(v.string(), v.description('Comma-separated product slugs, e.g. "zoho-crm,zoho-desk"'))),
        top_k: v.optional(v.pipe(v.number(), v.description('Results to return (1–20, default 5)'))),
    }),
    output: v.any(),
    async run({ input }) {
        return call('search_docs', input as Record<string, unknown>);
    },
});

const getPage = defineTool({
    name: 'zoho_kb_get_page',
    description: 'Fetch the full text of a Zoho documentation page. Use when a zoho_kb_search result is truncated or a complete code example or procedure is needed.',
    input: v.object({
        url: v.pipe(v.string(), v.description('Exact page URL from a zoho_kb_search result')),
        max_chars: v.optional(v.pipe(v.number(), v.description('Max chars to return (default 6000, max 20000)'))),
    }),
    output: v.any(),
    async run({ input }) {
        return call('get_page', input as Record<string, unknown>);
    },
});

const listProducts = defineTool({
    name: 'zoho_kb_list_products',
    description: 'List available Zoho documentation products with article counts and their slugs.',
    input: v.object({}),
    output: v.any(),
    async run() {
        return call('list_products', {});
    },
});

export const zohoKbTools = [searchDocs, getPage, listProducts];
