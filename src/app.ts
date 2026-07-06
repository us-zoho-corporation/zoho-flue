import { listAgents, listRuns } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config';
import { registerProviders } from './providers';
import { getAuth } from './auth';
import { getStores } from './store';

if (config._devWarnings.noApiSecret) {
	console.warn('[security] FLUE_API_SECRET is not set — all /api/* routes are unauthenticated. Set this in production.');
}
if (config._devWarnings.defaultCorsOrigins) {
	console.warn('[security] FLUE_CORS_ORIGINS is not set — using localhost defaults. Set this in production.');
}
if (config._devWarnings.usingMemoryStore) {
	console.warn('[store] STORE_BACKEND=memory — user data is in-process and non-durable. Use the Catalyst backend in production.');
}

const app = new Hono();

// User login + Catalyst-backed persistence. `stores` and `auth` are the only
// wiring the app needs; both depend on interfaces, not on Catalyst directly.
const stores = getStores();
const auth = getAuth();

app.get('/health', (c) => c.json({ ok: true }));

const corsOptions = { origin: config.corsOrigins, credentials: true };
app.use('/agents/*', cors(corsOptions));
app.use('/api/*', cors(corsOptions));

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
	models: config.chatModels.map(({ key, label }) => ({ key, label })),
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

app.get('/api/photo', auth.requireUser, async (c) => {
	const id = c.req.query('id') ?? '';
	if (!/^\d+$/.test(id)) return c.json({ error: 'Invalid photo ID' }, 400);
	let token: string;
	try {
		// Fetches the logged-in user's own photo; needs a contacts scope on their grant.
		token = await auth.getUserToken(c.get('userId') as string);
	} catch {
		return c.json({ error: 'reauth_required' }, 401);
	}
	const res = await fetch(`https://contacts.zoho.com/file?ID=${id}&fs=thumb`, {
		headers: { Authorization: `Zoho-oauthtoken ${token}` },
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

app.route('/', flue());

export default app;
