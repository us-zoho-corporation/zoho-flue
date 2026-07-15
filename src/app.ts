import { listAgents, listRuns } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { config } from './config';
import { registerProviders } from './providers';
import { getAuth } from './auth';
import { parseKeyring } from './auth/crypto';
import { zohoDomainFor } from './auth/zoho-oauth';
import { initPersistedSecrets } from './auth/secrets-bootstrap';
import { builtinMcpServers } from './mcp/builtins';
import { createMcpRoutes } from './mcp/routes';
import { getStores } from './store';

// Requests under these prefixes are owned by API/agent routing, never the
// static chat UI — checked by the static-file fallback below.
const APP_ROUTE_PREFIXES = ['/api/', '/agents/', '/workflows/', '/runs/', '/health'];
const CHAT_DIST_DIR = resolve('src/chat/dist');

if (config._devWarnings.noApiSecret) {
	console.warn('[security] FLUE_API_SECRET is not set — all /api/* routes are unauthenticated. Set this in production.');
}
if (config._devWarnings.defaultCorsOrigins) {
	console.warn('[security] FLUE_CORS_ORIGINS is not set — using localhost defaults. Set this in production.');
}
if (config._devWarnings.usingMemoryStore) {
	console.warn('[store] STORE_BACKEND=memory — user data is in-process and non-durable. Use the Catalyst backend in production.');
}
if (config._devWarnings.devAuth) {
	console.warn(`[security] ENV=${config.env} — /api/auth/dev-login is enabled and mints fake sessions without Zoho. Only use ENV=local or ENV=CI; never in production.`);
}

const app = new Hono();

// Baseline security headers (HSTS, X-Frame-Options, Referrer-Policy, etc.) on
// every response. No Content-Security-Policy is set here — it's opt-in in
// Hono and this app doesn't need one — so this can't conflict with the chat
// SPA's inline styles or the /api/photo route's own hand-set, stricter CSP.
app.use('*', secureHeaders());

// User login + Catalyst-backed persistence. `stores` and `auth` are the only
// wiring the app needs; both depend on interfaces, not on Catalyst directly.
const stores = getStores();

// Session-cookie secret + refresh-token encryption keyring: loaded from the
// durable secrets store (generated once on first boot — see secrets-bootstrap.ts)
// so they survive AppSail redeploys/restarts. Must resolve before getAuth() or
// anything else reads config.sessionSecret / config.dataEncryptionKey.
const { sessionSecret, dataEncryptionKey } = await initPersistedSecrets(stores);
config.sessionSecret = sessionSecret;
config.dataEncryptionKey = dataEncryptionKey;

const auth = getAuth();

app.get('/health', (c) => c.json({ ok: true }));

const corsOptions = { origin: config.corsOrigins, credentials: true };
app.use('/agents/*', cors(corsOptions));
app.use('/api/*', cors(corsOptions));

// Agent conversations are per-user data: require a valid session to read or
// drive them, so transcripts aren't reachable by conversation id when logged out.
app.use('/agents/*', auth.requireUser);

// Attach the logged-in user (if any) to every /api/* request.
app.use('/api/*', auth.optionalUser);

if (config.apiSecret) {
	app.use('/api/*', async (c, next) => {
		// Login/callback must be reachable without a session or the shared secret.
		if (c.req.path.startsWith('/api/auth/')) return next();
		// Accept either a valid user session (browser) or the machine-to-machine secret.
		if (c.get('userId') || c.req.header('x-flue-secret') === config.apiSecret) return next();
		return c.json({ error: 'Unauthorized' }, 401);
	});
}

app.route('/api/auth', auth.routes);

// Per-user external MCP server connections (CRUD + test). Behind requireUser.
app.use('/api/mcp-servers', auth.requireUser);
app.use('/api/mcp-servers/*', auth.requireUser);
app.route('/api/mcp-servers', createMcpRoutes({
	stores,
	keyring: parseKeyring(config.dataEncryptionKey),
	builtins: builtinMcpServers(),
}));

// Per-user preferences (Catalyst-backed). Requires a valid session.
app.get('/api/preferences', auth.requireUser, async (c) => {
	const prefs = await stores.preferences.get(c.get('userId') as string);
	return c.json(prefs ?? { preferredModelKey: config.defaultChatModelKey, data: {} });
});

app.put('/api/preferences', auth.requireUser, async (c) => {
	const userId = c.get('userId') as string;
	const body = await c.req.json().catch(() => ({})) as { preferredModelKey?: unknown; data?: unknown };
	// Only accept a known model key; ignore anything else.
	const known = config.chatModels.some((m) => m.key === body.preferredModelKey);
	const preferredModelKey = known ? (body.preferredModelKey as string) : config.defaultChatModelKey;
	const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
		? (body.data as Record<string, unknown>)
		: {};
	await stores.preferences.put({ userId, preferredModelKey, data, updatedAt: Date.now() });
	return c.json({ ok: true });
});

app.get('/api/agents', async (c) => c.json(await listAgents()));

// Provider-models the chat offers as a selectable option (single source of truth
// with the `assistant` agent's model resolution). The client carries the chosen
// `key` in the conversation id; the agent maps it back to a model spec.
app.get('/api/models', (c) => c.json({
	models: config.chatModels.map(({ key, label, requiresAuth, attachmentMimeTypes }) => ({ key, label, requiresAuth, attachmentMimeTypes })),
	defaultKey: config.defaultChatModelKey,
}));

app.get('/api/skills', async (c) => {
	const skillsDir = resolve('.agents/skills');
	let entries: string[] = [];
	try { entries = await readdir(skillsDir); } catch { return c.json([]); }

	const skills = await Promise.all(entries.map(async (name) => {
		const mdPath = join(skillsDir, name, 'SKILL.md');
		let description = '';
		let allowedTools: string[] = [];
		let compatibility = '';
		try {
			const text = await readFile(mdPath, 'utf8');
			const fm = text.match(/^---\n([\s\S]*?)\n---/);
			if (fm) {
				description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
				const tools = fm[1].match(/^allowed-tools:\s*(.+)$/m)?.[1]?.trim() ?? '';
				allowedTools = tools ? tools.split(/\s+/) : [];
				compatibility = fm[1].match(/^compatibility:\s*(.+)$/m)?.[1]?.trim() ?? '';
			}
		} catch {}
		return { name, description, allowedTools, compatibility };
	}));
	return c.json(skills.filter(s => s.description));
});

app.get('/api/runs', async (c) => {
	const result = await listRuns({ limit: 100 }).catch(() => ({ runs: [] }));
	return c.json(result.runs);
});

app.get('/api/workflows', async (c) => {
	const workflowsDir = resolve('src/workflows');
	let names: string[] = [];
	try {
		const entries = await readdir(workflowsDir);
		names = entries.filter(f => f.endsWith('.ts')).map(f => f.replace(/\.ts$/, ''));
	} catch {}

	const { runs } = await listRuns({ limit: 50 }).catch(() => ({ runs: [] }));
	return c.json({ workflows: names, runs });
});

// Register all model/auth providers once at startup. Their setup lives in
// src/providers/; app.ts just wires it in.
await registerProviders();

// Per-user identity, served from the Catalyst-backed store (no Zoho round-trip;
// the profile is captured at login). Requires a valid session.
app.get('/api/me', auth.requireUser, async (c) => {
	const user = await stores.users.getById(c.get('userId') as string);
	if (!user) return c.json({ error: 'Failed to fetch user info' }, 404);
	// Server-proxied photo URL so the client never constructs external URLs from API data.
	const photoUrl = user.photoId ? `/api/photo?id=${user.photoId}` : null;
	return c.json({
		displayName: user.displayName,
		email: user.email,
		firstName: user.firstName,
		lastName: user.lastName,
		photoUrl,
	});
});

// The signed-in user's Zoho CRM organization name + environment, for the
// profile popup. ZohoCRM.org.READ is one of the default login scopes
// (config.zohoLoginScopes), so this works right after a normal sign-in — no
// separate "Connect CRM" step needed. Best-effort: resolves to
// { orgName: null, environment: null } (never an error) if the grant predates
// that scope being added, was explicitly dropped via Disconnect, or the live
// call fails — this is a nice-to-have detail, not something the rest of the
// UI depends on.
app.get('/api/org', auth.requireUser, async (c) => {
	const empty = { orgName: null, environment: null };
	const userId = c.get('userId') as string;
	const token = await stores.tokens.get(userId);
	if (!token?.scopes.includes('ZohoCRM.org.READ')) return c.json(empty);
	try {
		const accessToken = await auth.getUserToken(userId);
		// Same data center this user's grant was issued from, not a hardcoded US
		// domain — org lookups for a non-US-DC org would otherwise 404/fail.
		const apiDomain = zohoDomainFor(token.accountsServer, 'www.zohoapis');
		const res = await fetch(`${apiDomain}/crm/v8/org`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) return c.json(empty);
		// `type` is Zoho's own field name for this — "production" | "sandbox" |
		// "bigin" | "developer" (https://www.zoho.com/crm/developer/docs/api/v8/get-org-data.html).
		const data = await res.json() as { org?: Array<{ company_name?: string; type?: string }> };
		const org = data.org?.[0];
		return c.json({ orgName: org?.company_name ?? null, environment: org?.type ?? null });
	} catch {
		return c.json(empty);
	}
});

app.get('/api/photo', auth.requireUser, async (c) => {
	const id = c.req.query('id') ?? '';
	if (!/^\d+$/.test(id)) return c.json({ error: 'Invalid photo ID' }, 400);
	const userId = c.get('userId') as string;
	let accessToken: string;
	try {
		// Fetches the logged-in user's own photo; needs a contacts scope on their grant.
		accessToken = await auth.getUserToken(userId);
	} catch {
		return c.json({ error: 'reauth_required' }, 401);
	}
	// Same data center this user's grant was issued from, not a hardcoded US domain.
	const stored = await stores.tokens.get(userId);
	const contactsDomain = zohoDomainFor(stored?.accountsServer ?? config.zohoAccountsBase, 'contacts.zoho');
	const res = await fetch(`${contactsDomain}/file?ID=${id}&fs=thumb`, {
		headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
	});
	if (!res.ok) return c.json({ error: 'Photo not found' }, 404);
	const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
	const upstream = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	const contentType = ALLOWED_IMAGE_TYPES.has(upstream) ? upstream : 'image/jpeg';
	return new Response(res.body, {
		headers: {
			'content-type': contentType,
			'content-disposition': 'inline; filename="photo"',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'private, max-age=3600',
		},
	});
});

const STATIC_MIME_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.map': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
};

// Serves the built chat UI (static assets + SPA fallback) same-origin, so the
// browser never needs cross-origin calls to the API — sidesteps the
// documented Slate<->AppSail CORS/auth-layer issue. Registered as middleware
// (not a terminal route) so it falls through via `next()` to the `flue()`
// mount below for anything it doesn't own — GET /agents/:name/:id (event
// streaming), /runs/:runId, etc. — instead of shadowing them.
app.use('*', async (c, next) => {
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();

	const reqPath = c.req.path;
	if (APP_ROUTE_PREFIXES.some((prefix) => reqPath === prefix || reqPath.startsWith(prefix))) return next();

	const relPath = reqPath === '/' ? 'index.html' : reqPath.slice(1);
	const resolved = resolve(CHAT_DIST_DIR, relPath);
	const rel = relative(CHAT_DIST_DIR, resolved);
	// Reject anything that escapes CHAT_DIST_DIR (defeats `..`-style path traversal).
	if (rel.startsWith('..') || isAbsolute(rel)) return next();

	const isFile = (await stat(resolved).catch(() => null))?.isFile() ?? false;
	const filePath = isFile ? resolved : join(CHAT_DIST_DIR, 'index.html');
	try {
		const body = await readFile(filePath);
		const contentType = STATIC_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
		return new Response(body, { headers: { 'content-type': contentType } });
	} catch {
		// Chat UI not built (e.g. local `flue dev` without `pnpm chat:build`) — fall through.
		return next();
	}
});

app.route('/', flue());

export default app;
