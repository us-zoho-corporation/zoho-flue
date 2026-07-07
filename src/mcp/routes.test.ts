import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMemoryStores } from '../store/memory/memory-stores';
import { decryptSecret, parseKeyring } from '../auth/crypto';

// Keep real URL validation; stub only the network probe.
vi.mock('./connect', async (orig) => {
	const actual = await orig<typeof import('./connect')>();
	return { ...actual, probeMcpServer: vi.fn(async () => ({ ok: true, tools: [{ name: 'search', description: 'Search' }] })) };
});
const { createMcpRoutes } = await import('./routes');
const { probeMcpServer } = await import('./connect');
import type { BuiltinMcpServer } from './builtins';

const KEY = 'k1:' + Buffer.alloc(32, 7).toString('base64');

function makeApp(builtins: BuiltinMcpServer[] = []) {
	const stores = createMemoryStores();
	const keyring = parseKeyring(KEY);
	const app = new Hono();
	// Simulate requireUser: userId from a test header (default 'u1').
	app.use('*', async (c, next) => { c.set('userId', c.req.header('x-test-user') || 'u1'); await next(); });
	app.route('/', createMcpRoutes({ stores, keyring, builtins }));
	return { app, stores, keyring };
}

const post = (app: Hono, path: string, body: unknown, user?: string) =>
	app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe('MCP server CRUD', () => {
	it('creates a server, stores the token encrypted, and never returns it', async () => {
		const { app, stores, keyring } = makeApp();
		const res = await post(app, '/', { name: 'Docs', url: 'https://mcp.example.com/mcp', transport: 'http', authToken: 'secret' });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json).toMatchObject({ name: 'Docs', url: 'https://mcp.example.com/mcp', transport: 'http', enabled: true, hasAuth: true });
		expect(json).not.toHaveProperty('authToken');
		expect(json).not.toHaveProperty('authTokenEnc');

		const stored = await stores.mcpServers.get('u1', json.id);
		expect(stored?.authTokenEnc).toMatch(/^v1:k1:/);
		expect(decryptSecret(stored!.authTokenEnc!, keyring)).toBe('secret');
	});

	it('validates name and URL (SSRF guard)', async () => {
		const { app } = makeApp();
		expect((await post(app, '/', { name: '', url: 'https://mcp.example.com' })).status).toBe(400);
		expect((await post(app, '/', { name: 'X', url: 'http://mcp.example.com' })).status).toBe(400);
		expect((await post(app, '/', { name: 'X', url: 'https://localhost/mcp' })).status).toBe(400);
	});

	it('lists only the caller’s servers', async () => {
		const { app } = makeApp();
		await post(app, '/', { name: 'Mine', url: 'https://a.example.com/mcp' }, 'u1');
		await post(app, '/', { name: 'Theirs', url: 'https://b.example.com/mcp' }, 'u2');
		const mine = await (await app.request('/', { headers: { 'x-test-user': 'u1' } })).json();
		expect(mine.servers.map((s: { name: string }) => s.name)).toEqual(['Mine']);
	});

	it('lists built-in servers first, flagged read-only', async () => {
		const { app } = makeApp([{ id: 'builtin:zoho-kb', name: 'Zoho Knowledge Base', url: 'https://help-docs.zoho-forge.com/mcp', transport: 'http', hasAuth: true }]);
		await post(app, '/', { name: 'Mine', url: 'https://a.example.com/mcp' });
		const { servers } = await (await app.request('/')).json() as { servers: { id: string; builtin: boolean }[] };
		expect(servers.map((s) => s.builtin)).toEqual([true, false]);
		expect(servers[0]).toMatchObject({ id: 'builtin:zoho-kb', builtin: true, enabled: true, hasAuth: true });
		expect(servers[0]).not.toHaveProperty('authTokenEnc');
	});

	it('updates fields, keeps the token when omitted, and clears it when null', async () => {
		const { app, stores, keyring } = makeApp();
		const { id } = await (await post(app, '/', { name: 'Docs', url: 'https://a.example.com/mcp', authToken: 'secret' })).json();

		await app.request(`/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Docs v2', enabled: false }) });
		let stored = await stores.mcpServers.get('u1', id);
		expect(stored?.name).toBe('Docs v2');
		expect(stored?.enabled).toBe(false);
		expect(decryptSecret(stored!.authTokenEnc!, keyring)).toBe('secret'); // kept

		await app.request(`/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authToken: null }) });
		stored = await stores.mcpServers.get('u1', id);
		expect(stored?.authTokenEnc).toBeNull(); // cleared
	});

	it('enforces ownership on update/delete/test (404 for other users)', async () => {
		const { app, stores } = makeApp();
		const { id } = await (await post(app, '/', { name: 'Docs', url: 'https://a.example.com/mcp' }, 'u1')).json();

		expect((await app.request(`/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-user': 'u2' }, body: '{}' })).status).toBe(404);
		expect((await post(app, `/${id}/test`, {}, 'u2')).status).toBe(404);
		await app.request(`/${id}`, { method: 'DELETE', headers: { 'x-test-user': 'u2' } });
		expect(await stores.mcpServers.get('u1', id)).not.toBeNull(); // not deleted by u2
	});

	it('tests a saved server and an ad-hoc target via the probe', async () => {
		const { app } = makeApp();
		const { id } = await (await post(app, '/', { name: 'Docs', url: 'https://a.example.com/mcp' })).json();

		expect(await (await post(app, `/${id}/test`, {})).json()).toEqual({ ok: true, tools: [{ name: 'search', description: 'Search' }] });
		expect(await (await post(app, '/test', { url: 'https://a.example.com/mcp', transport: 'http' })).json()).toEqual({ ok: true, tools: [{ name: 'search', description: 'Search' }] });
		expect(probeMcpServer).toHaveBeenCalledTimes(2);
	});
});
