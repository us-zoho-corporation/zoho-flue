import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as v from 'valibot';

const conn = vi.hoisted(() => ({ callMcpTool: vi.fn(async () => 'TOOL OUTPUT') }));
vi.mock('./connect', async (orig) => ({ ...(await orig<typeof import('./connect')>()), callMcpTool: conn.callMcpTool }));

const { buildMcpTools, jsonSchemaToValibot } = await import('./tools');
import type { McpServer } from '../store/types';

/**
 * Builds a minimal `McpServer` fixture for tests, with sensible defaults for
 * every field, allowing individual fields to be overridden per test case.
 * @param over - Partial `McpServer` fields to override the defaults with.
 * @returns A complete `McpServer` object suitable for passing to `buildMcpTools`.
 */
const server = (over: Partial<McpServer> = {}): McpServer => ({
	id: 's1', userId: 'u1', name: 'My Server', url: 'https://a.example.com/mcp',
	transport: 'http', authTokenEnc: null, enabled: true, createdAt: 0, updatedAt: 0, ...over,
});

beforeEach(() => conn.callMcpTool.mockReset().mockResolvedValue('TOOL OUTPUT'));

describe('jsonSchemaToValibot', () => {
	it('maps top-level properties and enforces required vs optional', () => {
		const s = jsonSchemaToValibot({ type: 'object', properties: { q: { type: 'string' }, n: { type: 'number' } }, required: ['q'] });
		expect(v.safeParse(s, { q: 'hi', n: 3 }).success).toBe(true);
		expect(v.safeParse(s, { q: 'hi' }).success).toBe(true);   // n optional
		expect(v.safeParse(s, { n: 3 }).success).toBe(false);      // q required
	});
	it('falls back to a permissive object schema for missing/non-object schemas', () => {
		expect(v.safeParse(jsonSchemaToValibot(undefined), { anything: 1 }).success).toBe(true);
	});
});

describe('buildMcpTools', () => {
	it('wraps each remote tool with a server-prefixed name and calls the server on run', async () => {
		const tools = buildMcpTools([{
			server: server(), authToken: 'tok',
			tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }],
		}]);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toMatch(/^mcp_my_server_search/);

		const res = await tools[0].run({ input: { q: 'hello' } });
		expect(conn.callMcpTool).toHaveBeenCalledWith(
			{ url: 'https://a.example.com/mcp', transport: 'http', authToken: 'tok' }, 'search', { q: 'hello' },
		);
		expect(res).toEqual([{ type: 'text', text: 'TOOL OUTPUT' }]);
	});

	it('returns an error text instead of throwing when a tool call fails', async () => {
		conn.callMcpTool.mockRejectedValueOnce(new Error('boom'));
		const tools = buildMcpTools([{ server: server(), authToken: null, tools: [{ name: 'x', description: '' }] }]);
		const res = await tools[0].run({ input: {} }) as { text: string }[];
		expect(res[0].text).toMatch(/failed: boom/);
	});

	it('disambiguates duplicate tool names across servers', () => {
		const t = [{ name: 'search', description: '' }];
		const tools = buildMcpTools([
			{ server: server({ id: 's1', name: 'Dup' }), authToken: null, tools: t },
			{ server: server({ id: 's2', name: 'Dup' }), authToken: null, tools: t },
		]);
		expect(new Set(tools.map((x) => x.name)).size).toBe(2);
	});
});
