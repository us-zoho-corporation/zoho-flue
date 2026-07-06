import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createMemoryStores } from '../store/memory/memory-stores';
import { parseKeyring } from './crypto';
import { createAuth } from './routes';
import type { AuthDeps } from './session';

const KEY = 'k1:' + Buffer.alloc(32, 7).toString('base64');

function makeDeps(): AuthDeps {
	return {
		stores: createMemoryStores(),
		keyring: parseKeyring(KEY),
		sessionSecret: 'a-test-session-secret-at-least-32b',
		sessionTtlSeconds: 3600,
		secureCookies: false,
		oauth: {
			clientId: 'cid',
			clientSecret: 'secret',
			redirectUri: 'http://localhost:3583/api/auth/callback',
			loginScopes: 'AaaServer.profile.READ',
		},
	};
}

function makeApp(deps: AuthDeps) {
	const app = new Hono();
	const auth = createAuth(deps);
	app.use('*', auth.optionalUser);
	app.get('/protected', auth.requireUser, (c) => c.json({ ok: true }));
	app.route('/', auth.routes);
	return app;
}

/** Reads Set-Cookie headers into a name->value jar. */
function jarFrom(res: Response): Record<string, string> {
	const list = typeof res.headers.getSetCookie === 'function'
		? res.headers.getSetCookie()
		: [res.headers.get('set-cookie')].filter(Boolean) as string[];
	const jar: Record<string, string> = {};
	for (const sc of list) {
		const pair = sc.split(';')[0];
		const i = pair.indexOf('=');
		if (i > 0) jar[pair.slice(0, i)] = pair.slice(i + 1);
	}
	return jar;
}
const cookieHeader = (jar: Record<string, string>) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

/** Mocks the Zoho token + userinfo endpoints. */
function mockZoho(refreshToken: string | undefined = 'user-refresh') {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		if (String(url).includes('/oauth/v2/token')) {
			return { ok: true, json: async () => ({
				access_token: 'user-access', ...(refreshToken ? { refresh_token: refreshToken } : {}),
				expires_in: 3600, scope: 'AaaServer.profile.READ',
			}) };
		}
		if (String(url).includes('/oauth/user/info')) {
			return { ok: true, json: async () => ({ ZUID: '777', Email: 'u@x.com', Display_Name: 'U X', First_Name: 'U', Last_Name: 'X' }) };
		}
		throw new Error(`unexpected fetch: ${url}`);
	}));
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => vi.restoreAllMocks());

describe('GET /login', () => {
	it('sets a login cookie and redirects to Zoho consent with PKCE + state', async () => {
		const app = makeApp(makeDeps());
		const res = await app.request('/login');
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get('location')!);
		expect(loc.origin + loc.pathname).toBe('https://accounts.zoho.com/oauth/v2/auth');
		expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
		expect(loc.searchParams.get('scope')).toBe('AaaServer.profile.READ');
		expect(loc.searchParams.get('state')).toBeTruthy();
		expect(jarFrom(res).flue_login).toBeTruthy();
	});
});

describe('GET /callback', () => {
	it('rejects a state mismatch with 403', async () => {
		const app = makeApp(makeDeps());
		const login = await app.request('/login');
		const cookies = jarFrom(login);
		const res = await app.request('/callback?code=abc&state=WRONG', { headers: { Cookie: cookieHeader(cookies) } });
		expect(res.status).toBe(403);
	});

	it('rejects when the login cookie is missing', async () => {
		const app = makeApp(makeDeps());
		const res = await app.request('/callback?code=abc&state=x');
		expect(res.status).toBe(400);
	});

	it('exchanges the code, persists the user + encrypted token, and opens a session', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);

		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const loginCookies = jarFrom(login);

		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(loginCookies) },
		});
		expect(cb.status).toBe(302);
		expect(cb.headers.get('location')).toBe('/');

		// User + token persisted; refresh token stored encrypted (not plaintext).
		const user = await deps.stores.users.getById('777');
		expect(user?.email).toBe('u@x.com');
		const token = await deps.stores.tokens.get('777');
		expect(token?.scopes).toEqual(['AaaServer.profile.READ']);
		expect(token?.refreshTokenEnc).toMatch(/^v1:k1:/);
		expect(token?.refreshTokenEnc).not.toContain('user-refresh');

		// The session cookie authenticates /me.
		const sid = jarFrom(cb);
		const me = await app.request('/me', { headers: { Cookie: cookieHeader(sid) } });
		expect(await me.json()).toMatchObject({ authenticated: true, user: { userId: '777' }, scopes: ['AaaServer.profile.READ'] });
	});
});

describe('session lifecycle', () => {
	it('protects routes and clears the session on logout', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);

		// Unauthenticated → 401.
		expect((await app.request('/protected')).status).toBe(401);

		// Log in.
		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const session = cookieHeader(jarFrom(cb));

		// Authenticated → 200.
		expect((await app.request('/protected', { headers: { Cookie: session } })).status).toBe(200);

		// Logout deletes the session row.
		const out = await app.request('/logout', { method: 'POST', headers: { Cookie: session } });
		expect(await out.json()).toEqual({ ok: true });
		expect((await app.request('/protected', { headers: { Cookie: session } })).status).toBe(401);
	});
});
