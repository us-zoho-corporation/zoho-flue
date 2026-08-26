import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Minimal stub context fields every tool's `run()` now requires (toolCallId, log).
const noopLog = { info() {}, warn() {}, error() {} };

vi.mock('../config', () => ({ config: { zohoDocsMcpUrl: 'https://help-docs.zoho-forge.com/mcp' } }));

// Mocked MCP SDK client, mirroring src/mcp/connect.test.ts's pattern.
const ctl = vi.hoisted(() => ({
	connect: vi.fn(async () => {}),
	callTool: vi.fn(async () => ({ content: [{ type: 'text', text: '{"title":"T"}' }] })),
	closed: false,
}));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		connect() { return ctl.connect(); }
		callTool() { return ctl.callTool(); }
		async close() { ctl.closed = true; }
	},
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }));

const { extractText, defineZohoKbTools } = await import('./zoho-kb');
const { DocsReauthRequiredError } = await import('../auth/docs-oauth');
const { parseConnectionRequired } = await import('../tools/connection-required');

beforeEach(() => {
	ctl.connect.mockReset().mockResolvedValue(undefined);
	ctl.callTool.mockReset().mockResolvedValue({ content: [{ type: 'text', text: '{"title":"T"}' }] });
	ctl.closed = false;
});
afterEach(() => vi.restoreAllMocks());

describe('extractText', () => {
    it('formats a JSON search result as readable lines', () => {
        const content = [{
            type: 'text',
            text: JSON.stringify({
                title: 'Payment methods',
                url: 'https://help.zoho.com/billing/payment-methods',
                content: 'You can retrieve payment methods via the API.',
            }),
        }];
        expect(extractText(content)).toBe(
            'Title: Payment methods\n'
            + 'URL: https://help.zoho.com/billing/payment-methods\n'
            + 'You can retrieve payment methods via the API.',
        );
    });

    it('uses excerpt when content is absent', () => {
        const content = [{ type: 'text', text: JSON.stringify({ title: 'T', excerpt: 'short' }) }];
        expect(extractText(content)).toBe('Title: T\nshort');
    });

    it('joins multiple results with a separator', () => {
        const content = [
            { type: 'text', text: JSON.stringify({ title: 'A' }) },
            { type: 'text', text: JSON.stringify({ title: 'B' }) },
        ];
        expect(extractText(content)).toBe('Title: A\n\n---\n\nTitle: B');
    });

    it('passes through non-JSON text unchanged', () => {
        const content = [{ type: 'text', text: 'plain text result' }];
        expect(extractText(content)).toBe('plain text result');
    });

    it('does not strip markdown from result content', () => {
        const content = [{ type: 'text', text: JSON.stringify({ title: '**Bold title**' }) }];
        expect(extractText(content)).toBe('Title: **Bold title**');
    });

    it('truncates output beyond the overall cap', () => {
        const big = 'x'.repeat(20_000);
        const content = [{ type: 'text', text: big }];
        const result = extractText(content);
        expect(result.endsWith('\n[truncated]')).toBe(true);
        expect(result.length).toBeLessThan(big.length);
    });

    it('handles non-array content', () => {
        expect(extractText('raw string')).toBe('raw string');
    });

    it('formats search_docs\' real shape: hits wrapped in a `results` array with a confidence preamble', () => {
        // The live search_docs response wraps hits in `results` (each with `title`/`url`/
        // `chunk_text`, not the flat `title`/`url`/`content` the old code assumed) — that
        // mismatch made every formatted hit an empty string, so the model saw no results
        // even when the KB had strong matches. This locks in the fix.
        const content = [{
            type: 'text',
            text: JSON.stringify({
                confidence: 'high',
                top_score: 0.9998,
                quality_hint: 'Results are strong. Cite [title](deep_link) for every factual claim.',
                results: [
                    {
                        score: 0.9998,
                        title: 'Configuring Workflow Rules',
                        url: 'https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules',
                        deep_link: 'https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules#configuring-workflow-rules',
                        chunk_text: 'Workflow Rules in Zoho CRM are a set of actions...',
                    },
                ],
            }),
        }];
        const result = extractText(content);
        expect(result).toContain('Confidence: high');
        expect(result).toContain('Results are strong');
        expect(result).toContain('Title: Configuring Workflow Rules');
        // Prefers the more specific deep_link over the plain url for citation.
        expect(result).toContain('URL: https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules#configuring-workflow-rules');
        expect(result).toContain('Workflow Rules in Zoho CRM are a set of actions');
    });

    it('falls back to raw JSON for a result with no recognized field (e.g. list_products)', () => {
        const content = [{ type: 'text', text: JSON.stringify({ name: 'crm', article_count: 1234 }) }];
        expect(extractText(content)).toBe('{"name":"crm","article_count":1234}');
    });
});

/**
 * Runs a tool call expected to throw and returns the caught error.
 * @param run - A thunk returning the tool's `run()` promise (sync or async).
 * @returns The rejected value, expected to be an `Error`.
 */
async function catchError(run: () => unknown): Promise<Error> {
    return Promise.resolve(run()).then(
        () => { throw new Error('expected run() to throw, but it resolved'); },
        (e: unknown) => e as Error,
    );
}

describe('defineZohoKbTools', () => {
    it('throws a docs connection-required payload (mode: connect) when there is no logged-in user', async () => {
        const [searchDocs] = defineZohoKbTools({ userId: undefined, getDocsToken: async () => 'tok' });
        const err = await catchError(() => searchDocs.run({ data: { query: 'x' } , toolCallId: 'test-call', log: noopLog}));
        expect(parseConnectionRequired(err.message)).toMatchObject({ kind: 'docs', mode: 'connect', label: 'Zoho Knowledge Base' });
        expect(ctl.connect).not.toHaveBeenCalled();
    });

    it('throws mode: connect when the user has never connected the docs knowledge base', async () => {
        const [searchDocs] = defineZohoKbTools({ userId: 'u1', getDocsToken: async () => { throw new Error('not connected'); } });
        const err = await catchError(() => searchDocs.run({ data: { query: 'x' } , toolCallId: 'test-call', log: noopLog}));
        expect(parseConnectionRequired(err.message)).toMatchObject({ kind: 'docs', mode: 'connect' });
    });

    it('throws mode: reconnect when the stored refresh token was rejected', async () => {
        const [searchDocs] = defineZohoKbTools({ userId: 'u1', getDocsToken: async () => { throw new DocsReauthRequiredError(); } });
        const err = await catchError(() => searchDocs.run({ data: { query: 'x' } , toolCallId: 'test-call', log: noopLog}));
        expect(parseConnectionRequired(err.message)).toMatchObject({ kind: 'docs', mode: 'reconnect' });
    });

    it('opens a short-lived client per call with the user\'s own access token, and closes it afterward', async () => {
        const getDocsToken = vi.fn(async () => 'user-access-token');
        const [searchDocs] = defineZohoKbTools({ userId: 'u1', getDocsToken });
        await searchDocs.run({ data: { query: 'x' } , toolCallId: 'test-call', log: noopLog});
        expect(getDocsToken).toHaveBeenCalledWith('u1');
        expect(ctl.connect).toHaveBeenCalledTimes(1);
        expect(ctl.callTool).toHaveBeenCalledTimes(1);
        expect(ctl.closed).toBe(true);
    });

    it('get_page and list_products also authenticate with the user\'s own token', async () => {
        const getDocsToken = vi.fn(async () => 'user-access-token');
        const [, getPage, listProducts] = defineZohoKbTools({ userId: 'u1', getDocsToken });
        await getPage.run({ data: { url: 'https://help.zoho.com/x' } , toolCallId: 'test-call', log: noopLog});
        await listProducts.run({ data: {} , toolCallId: 'test-call', log: noopLog});
        expect(getDocsToken).toHaveBeenCalledTimes(2);
        expect(ctl.callTool).toHaveBeenCalledTimes(2);
    });
});
