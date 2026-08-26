import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';
import { DocsReauthRequiredError } from '../auth/docs-oauth';
import { throwConnectionRequired } from '../tools/connection-required';

// Allowlist of MCP tool names this client is permitted to call.
const ALLOWED_MCP_TOOLS = new Set(['search_docs', 'get_page', 'list_products']);

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

/** What the knowledge-base tools need to resolve the calling turn's own docs connection. */
export interface ZohoKbDeps {
    /** The logged-in user's id, or `undefined` outside a real request (e.g. `flue run` from the CLI). */
    userId?: string;
    /** Resolves a live docs MCP access token for a user, refreshing as needed. */
    getDocsToken: (userId: string) => Promise<string>;
}

/**
 * Invokes an allowlisted MCP tool on the Zoho docs server, using the calling
 * user's own per-user OAuth access token (see `src/auth/docs-oauth.ts` — the
 * docs MCP server runs its own authorization server, not accounts.zoho.com).
 * A short-lived MCP client is opened for just this one call and closed
 * afterward — there is no shared, process-wide client, since the token is
 * per user.
 * @param deps - The calling turn's user id and docs-token resolver.
 * @param name - The MCP tool name to call; must be in `ALLOWED_MCP_TOOLS`.
 * @param args - The arguments to pass to the tool.
 * @returns A single-element text content array with the formatted tool output.
 * @throws {Error} If `name` is not in `ALLOWED_MCP_TOOLS`, or a `ConnectionRequiredPayload`-encoded
 * error (see `connection-required.ts`) if the user hasn't connected the knowledge base, or the call
 * to the MCP server itself fails.
 */
async function call(deps: ZohoKbDeps, name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_MCP_TOOLS.has(name)) {
        throw new Error(`MCP tool call blocked: '${name}' is not an allowed tool.`);
    }

    const userId = deps.userId;
    if (!userId) throwConnectionRequired({ kind: 'docs', mode: 'connect', label: 'Zoho Knowledge Base' });

    let accessToken: string;
    try {
        accessToken = await deps.getDocsToken(userId);
    } catch (err) {
        throwConnectionRequired({
            kind: 'docs',
            mode: err instanceof DocsReauthRequiredError ? 'reconnect' : 'connect',
            label: 'Zoho Knowledge Base',
        });
    }

    const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
    await client.connect(
        new StreamableHTTPClientTransport(new URL(config.zohoDocsMcpUrl), {
            requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
        }),
    );
    try {
        const result = await client.callTool({ name, arguments: args });
        return [{ type: 'text', text: extractText(result.content) }];
    } finally {
        try { await client.close(); } catch { /* ignore — connection is being discarded anyway */ }
    }
}

/**
 * Builds the knowledge-base tools bound to one turn's calling user, so each
 * tool call authenticates as that user (see {@link call}).
 * @param deps - The calling turn's user id and docs-token resolver.
 * @returns The `zoho_kb_search`, `zoho_kb_get_page`, and `zoho_kb_list_products` tools.
 */
export function defineZohoKbTools(deps: ZohoKbDeps) {
    const searchDocs = defineTool({
        name: 'zoho_kb_search',
        description: 'Search the Zoho knowledge base. Use this before answering any question about Zoho product features, configuration, APIs, or troubleshooting — prefer sourced answers over memory.',
        input: v.object({
            query: v.string(),
            products: v.optional(v.pipe(v.string(), v.description('Comma-separated product slugs, e.g. "zoho-crm,zoho-desk"'))),
            top_k: v.optional(v.pipe(v.number(), v.description('Results to return (1–20, default 5)'))),
        }),
        output: v.any(),
        async run({ data }) {
            return { output: await call(deps, 'search_docs', data as Record<string, unknown>) };
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
        async run({ data }) {
            return { output: await call(deps, 'get_page', data as Record<string, unknown>) };
        },
    });

    const listProducts = defineTool({
        name: 'zoho_kb_list_products',
        description: 'List available Zoho documentation products with article counts and their slugs.',
        input: v.object({}),
        output: v.any(),
        async run() {
            return { output: await call(deps, 'list_products', {}) };
        },
    });

    return [searchDocs, getPage, listProducts] as const;
}
