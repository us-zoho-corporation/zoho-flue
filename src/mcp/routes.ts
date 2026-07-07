import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { decryptSecret, encryptSecret, type Keyring } from '../auth/crypto';
import type { McpServer, Stores } from '../store/types';
import { probeMcpServer, validateMcpUrl, type McpTransport } from './connect';
import type { BuiltinMcpServer } from './builtins';

export interface McpRoutesDeps {
	stores: Stores;
	keyring: Keyring;
	/** App-owned, read-only servers surfaced alongside the user's connections. */
	builtins: BuiltinMcpServer[];
}

/** Client-safe view of a server — never exposes the encrypted token. */
function sanitize(s: McpServer) {
	return {
		id: s.id,
		name: s.name,
		url: s.url,
		transport: s.transport,
		enabled: s.enabled,
		hasAuth: s.authTokenEnc !== null,
		builtin: false,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
	};
}

/** Client-safe view of a built-in server (read-only, always enabled). */
function sanitizeBuiltin(b: BuiltinMcpServer) {
	return {
		id: b.id,
		name: b.name,
		url: b.url,
		transport: b.transport,
		enabled: true,
		hasAuth: b.hasAuth,
		builtin: true,
		createdAt: 0,
		updatedAt: 0,
	};
}

function parseTransport(v: unknown): McpTransport {
	return v === 'sse' ? 'sse' : 'http';
}

/**
 * Per-user CRUD for external MCP server connections. Mounted at
 * `/api/mcp-servers` behind `requireUser`, so `c.get('userId')` is always set.
 * Auth tokens are encrypted at rest and never returned to the client.
 */
export function createMcpRoutes(deps: McpRoutesDeps): Hono {
	const app = new Hono();
	const uid = (c: { get: (k: 'userId') => string | undefined }) => c.get('userId') as string;

	app.get('/', async (c) => {
		const servers = await deps.stores.mcpServers.listForUser(uid(c));
		// Built-in (read-only) servers first, then the user's own connections.
		return c.json({ servers: [...deps.builtins.map(sanitizeBuiltin), ...servers.map(sanitize)] });
	});

	app.post('/', async (c) => {
		const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
		const name = typeof body.name === 'string' ? body.name.trim() : '';
		const url = typeof body.url === 'string' ? body.url.trim() : '';
		if (!name) return c.json({ error: 'Name is required.' }, 400);
		const urlError = validateMcpUrl(url);
		if (urlError) return c.json({ error: urlError }, 400);

		const userId = uid(c);
		const now = Date.now();
		const token = typeof body.authToken === 'string' && body.authToken ? body.authToken : null;
		const server: McpServer = {
			id: randomUUID(),
			userId,
			name,
			url,
			transport: parseTransport(body.transport),
			authTokenEnc: token ? encryptSecret(token, deps.keyring) : null,
			enabled: body.enabled !== false,
			createdAt: now,
			updatedAt: now,
		};
		await deps.stores.mcpServers.create(server);
		return c.json(sanitize(server), 201);
	});

	app.put('/:id', async (c) => {
		const userId = uid(c);
		const current = await deps.stores.mcpServers.get(userId, c.req.param('id'));
		if (!current) return c.json({ error: 'not_found' }, 404);

		const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
		const name = typeof body.name === 'string' ? body.name.trim() : current.name;
		const url = typeof body.url === 'string' ? body.url.trim() : current.url;
		if (!name) return c.json({ error: 'Name is required.' }, 400);
		const urlError = validateMcpUrl(url);
		if (urlError) return c.json({ error: urlError }, 400);

		// authToken: omit = keep; '' or null = clear; non-empty = replace.
		let authTokenEnc = current.authTokenEnc;
		if ('authToken' in body) {
			authTokenEnc = typeof body.authToken === 'string' && body.authToken
				? encryptSecret(body.authToken, deps.keyring)
				: null;
		}

		const updated: McpServer = {
			...current,
			name,
			url,
			transport: 'transport' in body ? parseTransport(body.transport) : current.transport,
			enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
			authTokenEnc,
			updatedAt: Date.now(),
		};
		await deps.stores.mcpServers.update(updated);
		return c.json(sanitize(updated));
	});

	app.delete('/:id', async (c) => {
		await deps.stores.mcpServers.delete(uid(c), c.req.param('id'));
		return c.json({ ok: true });
	});

	// Test a saved server (uses its stored, decrypted token).
	app.post('/:id/test', async (c) => {
		const server = await deps.stores.mcpServers.get(uid(c), c.req.param('id'));
		if (!server) return c.json({ error: 'not_found' }, 404);
		const authToken = server.authTokenEnc ? decryptSecret(server.authTokenEnc, deps.keyring) : null;
		return c.json(await probeMcpServer({ url: server.url, transport: server.transport, authToken }));
	});

	// Ad-hoc test before saving.
	app.post('/test', async (c) => {
		const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
		const url = typeof body.url === 'string' ? body.url.trim() : '';
		const authToken = typeof body.authToken === 'string' && body.authToken ? body.authToken : null;
		return c.json(await probeMcpServer({ url, transport: parseTransport(body.transport), authToken }));
	});

	return app;
}
