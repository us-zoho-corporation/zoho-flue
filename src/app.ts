import { listAgents, listRuns } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config';
import { getZohoAccessToken } from './providers/zoho-auth';
import { registerCatalystGLM } from './providers/catalyst-glm';

if (config._devWarnings.noApiSecret) {
	console.warn('[security] FLUE_API_SECRET is not set — all /api/* routes are unauthenticated. Set this in production.');
}
if (config._devWarnings.defaultCorsOrigins) {
	console.warn('[security] FLUE_CORS_ORIGINS is not set — using localhost defaults. Set this in production.');
}

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

const corsOptions = { origin: config.corsOrigins, credentials: true };
app.use('/agents/*', cors(corsOptions));
app.use('/api/*', cors(corsOptions));

if (config.apiSecret) {
	app.use('/api/*', async (c, next) => {
		if (c.req.header('x-flue-secret') !== config.apiSecret) {
			return c.json({ error: 'Unauthorized' }, 401);
		}
		return next();
	});
}

app.get('/api/agents', async (c) => c.json(await listAgents()));

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

const oauthCreds = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
};

// Register the Catalyst GLM provider once at startup (runtime provider setup
// belongs in app.ts, not in agent modules). The provider refreshes the token
// itself via oauth on a 401. contextWindow lets Flue's compaction trigger.
registerCatalystGLM({
	endpoint: config.catalystEndpoint,
	orgId: config.catalystOrgId,
	token: await getZohoAccessToken(oauthCreds),
	oauth: oauthCreds,
	contextWindow: config.catalystContextWindow,
});

app.get('/api/me', async (c) => {
	const token = await getZohoAccessToken(oauthCreds);
	const res = await fetch('https://accounts.zoho.com/oauth/user/info', {
		headers: { Authorization: `Zoho-oauthtoken ${token}` },
	});
	if (!res.ok) return c.json({ error: 'Failed to fetch user info' }, 502);
	const data = await res.json() as Record<string, string>;
	const rawPhotoId = data['Photo_ID'];
	const photoId = /^\d+$/.test(rawPhotoId ?? '') ? rawPhotoId : null;
	// Return a server-proxied URL so the client never constructs external URLs from API data.
	const photoUrl = photoId ? `/api/photo?id=${photoId}` : null;
	return c.json({
		displayName: data['Display_Name'] ?? data['First_Name'] ?? '',
		email: data['Email'] ?? '',
		firstName: data['First_Name'] ?? '',
		lastName: data['Last_Name'] ?? '',
		photoUrl,
	});
});

app.get('/api/photo', async (c) => {
	const id = c.req.query('id') ?? '';
	if (!/^\d+$/.test(id)) return c.json({ error: 'Invalid photo ID' }, 400);
	const token = await getZohoAccessToken(oauthCreds);
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
