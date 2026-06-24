import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';

const MCP_URL = 'https://help-docs.zoho-forge.com/mcp';

// Allowlist of MCP tool names this client is permitted to call.
const ALLOWED_MCP_TOOLS = new Set(['search_docs', 'get_page', 'list_products']);

/** Returns true if the JWT's `exp` claim is in the past. Returns false for malformed tokens or tokens with no `exp`. */
export function isTokenExpired(jwt: string): boolean {
    try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as { exp?: number };
        return typeof payload.exp === 'number' && payload.exp < Date.now() / 1000;
    } catch {
        return false;
    }
}

let _client: Client | null = null;

/** Returns the singleton MCP client, creating and connecting it on first use. Throws if the token is expired. */
async function getClient(): Promise<Client> {
    if (isTokenExpired(config.zohoDocsToken)) {
        await resetClient();
        throw new Error('ZOHO_DOCS_TOKEN has expired — re-run the browser OAuth flow to obtain a new token.');
    }
    if (_client) return _client;
    const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
    await client.connect(
        new StreamableHTTPClientTransport(new URL(MCP_URL), {
            requestInit: { headers: { Authorization: `Bearer ${config.zohoDocsToken}` } },
        }),
    );
    _client = client;
    return client;
}

/** Closes the current client and clears the singleton so the next call to getClient reconnects. */
async function resetClient(): Promise<void> {
    try { await _client?.close(); } catch { /* ignore */ }
    _client = null;
}

/**
 * Calls an MCP tool by name, retrying once after a reconnect on failure.
 * Throws immediately if `name` is not in ALLOWED_MCP_TOOLS.
 */
const MAX_RESULT_CHARS = 12_000;

/**
 * Calls an MCP tool by name, retrying once after a reconnect on failure.
 * Throws immediately if `name` is not in ALLOWED_MCP_TOOLS.
 * Truncates results to MAX_RESULT_CHARS to stay within Catalyst GLM's input limit.
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
    const text = JSON.stringify(result.content);
    if (text.length <= MAX_RESULT_CHARS) return result.content;
    return [{ type: 'text', text: text.slice(0, MAX_RESULT_CHARS) + '\n[truncated]' }];
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
