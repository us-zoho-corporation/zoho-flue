import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';

const MCP_URL = 'https://help-docs.zoho-forge.com/mcp';

// Allowlist of MCP tool names this client is permitted to call.
const ALLOWED_MCP_TOOLS = new Set(['search_docs', 'get_page', 'list_products']);

let _client: Client | null = null;

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

async function resetClient(): Promise<void> {
    try { await _client?.close(); } catch { /* ignore */ }
    _client = null;
}

// Single overall cap on tool output. Compaction handles longer conversations,
// but one unbounded blob still wastes the model's context, so cap it once.
const MAX_RESULT_CHARS = 12_000;

/** Extracts a readable plain-text view of MCP result content. */
export function extractText(content: unknown): string {
    if (!Array.isArray(content)) return String(content).slice(0, MAX_RESULT_CHARS);
    const parts: string[] = [];
    for (const block of content) {
        if (typeof block !== 'object' || block === null || !('text' in block)) continue;
        const raw = (block as { text: string }).text;
        // search_docs returns each result as a JSON string; format it as readable lines.
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const lines: string[] = [];
            if (parsed.title) lines.push(`Title: ${String(parsed.title)}`);
            if (parsed.url) lines.push(`URL: ${String(parsed.url)}`);
            const body = typeof parsed.content === 'string' ? parsed.content
                : typeof parsed.excerpt === 'string' ? parsed.excerpt : '';
            if (body) lines.push(String(body));
            parts.push(lines.join('\n'));
        } catch {
            parts.push(raw);
        }
    }
    const joined = parts.join('\n\n---\n\n');
    return joined.length <= MAX_RESULT_CHARS ? joined : joined.slice(0, MAX_RESULT_CHARS) + '\n[truncated]';
}

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
