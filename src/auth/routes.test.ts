import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createMemoryStores } from '../store/memory/memory-stores';
import { parseKeyring } from './crypto';
import { createAuth } from './routes';
import type { AuthDeps } from './session';

const KEY = 'k1:' + Buffer.alloc(32, 7).toString('base64');

/**
 * Builds a baseline `AuthDeps` fixture (in-memory stores, fixed test keyring/secret,
 * insecure cookies, dev auth disabled) for exercising the auth routes in tests.
 * @returns A fresh `AuthDeps` fixture.
 */
function makeDeps(): AuthDeps {
	return {
		stores: createMemoryStores(),
		keyring: parseKeyring(KEY),
		sessionSecret: 'a-test-session-secret-at-least-32b',
		sessionTtlSeconds: 3600,
		secureCookies: false,
		devAuth: false,
		oauth: {
			clientId: 'cid',
			clientSecret: 'secret',
			redirectUri: 'http://localhost:3583/api/auth/callback',
			loginScopes: 'AaaServer.profile.READ',
		},
		docsOauth: {
			clientId: 'docs-cid',
			clientSecret: 'docs-secret',
			authorizeUrl: 'https://help-docs.zoho-forge.com/authorize',
			tokenUrl: 'https://help-docs.zoho-forge.com/token',
			redirectUri: 'http://localhost:3583/api/auth/docs/callback',
			scopes: 'openid profile email',
		},
		products: [
			{ key: 'crm', label: 'Zoho CRM', description: 'CRM access.', scopes: ['ZohoCRM.modules.ALL'] },
			{ key: 'desk', label: 'Zoho Desk', description: 'Desk access.', scopes: ['Desk.basic.READ', 'Desk.tickets.READ'] },
		],
	};
}

/**
 * Wires a test Hono app with the auth middleware, a couple of protected probe
 * routes, and the auth sub-app mounted at the root.
 * @param deps - Auth dependencies to build the auth bundle from.
 * @returns The configured Hono app.
 */
function makeApp(deps: AuthDeps) {
	const app = new Hono();
	const auth = createAuth(deps);
	app.use('*', auth.optionalUser);
	app.get('/protected', auth.requireUser, (c) => c.json({ ok: true }));
	app.get('/whoami-token', async (c) => c.json({ token: await auth.resolveUserToken(c) }));
	app.route('/', auth.routes);
	return app;
}

/**
 * Reads Set-Cookie headers into a name->value jar.
 * @param res - The response to read `Set-Cookie` headers from.
 * @returns A map of cookie name to cookie value.
 */
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
/**
 * Serializes a cookie jar into a `Cookie` request header value.
 * @param jar - Map of cookie name to cookie value, e.g. from {@link jarFrom}.
 * @returns The `key=value; key2=value2` header string.
 */
const cookieHeader = (jar: Record<string, string>) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

/**
 * Mocks the Zoho token + userinfo endpoints.
 * @param refreshToken - Refresh token to include in the mocked token response, or `undefined` to omit it (simulating no-refresh-token-on-reconsent).
 */
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

describe('resolveUserToken (per-user provider token)', () => {
	it('returns the live user token when signed in, null for guests', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);

		// Guest → null.
		expect(await (await app.request('/whoami-token')).json()).toEqual({ token: null });

		// Sign in, then resolve the token from the session.
		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const session = cookieHeader(jarFrom(cb));
		expect(await (await app.request('/whoami-token', { headers: { Cookie: session } })).json()).toEqual({ token: 'user-access' });
	});
});

describe('GET /connections', () => {
	it('reports every configured product as disconnected for a guest', async () => {
		const app = makeApp(makeDeps());
		const res = await app.request('/connections');
		expect(await res.json()).toEqual({
			connections: [
				{ key: 'crm', label: 'Zoho CRM', description: 'CRM access.', scopes: ['ZohoCRM.modules.ALL'], connected: false },
				{ key: 'desk', label: 'Zoho Desk', description: 'Desk access.', scopes: ['Desk.basic.READ', 'Desk.tickets.READ'], connected: false },
				{ key: 'docs', label: 'Zoho Knowledge Base', description: expect.any(String), scopes: [], connected: false, kind: 'docs' },
			],
		});
	});

	it('omits the docs row entirely when no docs OAuth client is configured', async () => {
		const deps = makeDeps();
		deps.docsOauth = { ...deps.docsOauth, clientId: '' };
		const app = makeApp(deps);
		const { connections } = await (await app.request('/connections')).json() as { connections: Array<{ key: string }> };
		expect(connections.map((c) => c.key)).toEqual(['crm', 'desk']);
	});

	it('marks docs connected once a token is stored for the user', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);
		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const session = cookieHeader(jarFrom(cb));
		await deps.stores.docsTokens.put({ userId: '777', refreshTokenEnc: 'enc:docs', updatedAt: Date.now() });

		const { connections } = await (await app.request('/connections', { headers: { Cookie: session } })).json() as { connections: Array<{ key: string; connected: boolean }> };
		expect(connections.find((c) => c.key === 'docs')?.connected).toBe(true);
	});

	it('marks a product connected once the user has granted its full scope bundle', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);

		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		// Grant only Desk's scopes directly on the stored token (simulating a prior incremental login).
		const token = await deps.stores.tokens.get('777');
		await deps.stores.tokens.put({ ...token!, scopes: [...token!.scopes, 'Desk.basic.READ', 'Desk.tickets.READ'] });

		const session = cookieHeader(jarFrom(cb));
		const res = await app.request('/connections', { headers: { Cookie: session } });
		const { connections } = await res.json() as { connections: Array<{ key: string; connected: boolean }> };
		expect(connections.find((c) => c.key === 'desk')?.connected).toBe(true);
		expect(connections.find((c) => c.key === 'crm')?.connected).toBe(false);
	});
});

describe('POST /connections/:key/disconnect', () => {
	it('401s for a guest', async () => {
		const app = makeApp(makeDeps());
		expect((await app.request('/connections/desk/disconnect', { method: 'POST' })).status).toBe(401);
	});

	it('404s for an unknown product key', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);
		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const session = cookieHeader(jarFrom(cb));
		expect((await app.request('/connections/nope/disconnect', { method: 'POST', headers: { Cookie: session } })).status).toBe(404);
	});

	it('drops only the disconnected product\'s scopes, leaving the rest intact', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);

		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const token = await deps.stores.tokens.get('777');
		await deps.stores.tokens.put({ ...token!, scopes: [...token!.scopes, 'ZohoCRM.modules.ALL', 'Desk.basic.READ', 'Desk.tickets.READ'] });

		const session = cookieHeader(jarFrom(cb));
		const res = await app.request('/connections/desk/disconnect', { method: 'POST', headers: { Cookie: session } });
		expect(await res.json()).toEqual({ ok: true });

		const after = await deps.stores.tokens.get('777');
		expect(after?.scopes).toEqual(expect.arrayContaining(['AaaServer.profile.READ', 'ZohoCRM.modules.ALL']));
		expect(after?.scopes).not.toContain('Desk.basic.READ');
		expect(after?.scopes).not.toContain('Desk.tickets.READ');
	});

	it('drops the stored docs token outright (no scope bundle to diff)', async () => {
		mockZoho();
		const deps = makeDeps();
		const app = makeApp(deps);
		const login = await app.request('/login');
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
		const cb = await app.request(`/callback?code=abc&state=${encodeURIComponent(state)}`, {
			headers: { Cookie: cookieHeader(jarFrom(login)) },
		});
		const session = cookieHeader(jarFrom(cb));
		await deps.stores.docsTokens.put({ userId: '777', refreshTokenEnc: 'enc:docs', updatedAt: Date.now() });

		const res = await app.request('/connections/docs/disconnect', { method: 'POST', headers: { Cookie: session } });
		expect(await res.json()).toEqual({ ok: true });
		expect(await deps.stores.docsTokens.get('777')).toBeNull();
	});
});

describe('GET /dev-login (test seam)', () => {
	it('404s when devAuth is disabled', async () => {
		const app = makeApp(makeDeps()); // devAuth: false
		expect((await app.request('/dev-login')).status).toBe(404);
	});

	it('mints a real session for a fake user when enabled', async () => {
		const deps = { ...makeDeps(), devAuth: true };
		const app = makeApp(deps);

		const res = await app.request('/dev-login?returnTo=/');
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/');
		const session = cookieHeader(jarFrom(res));
		expect(session).toContain('flue_sid=');

		// The minted cookie authenticates /me and the requireUser-gated /protected.
		const me = await (await app.request('/me', { headers: { Cookie: session } })).json();
		expect(me).toMatchObject({ authenticated: true, user: { userId: 'dev-user', email: 'dev@example.com' } });
		expect(me.scopes).toContain('AaaServer.profile.READ');
		expect((await app.request('/protected', { headers: { Cookie: session } })).status).toBe(200);

		// Fake user + placeholder token were persisted.
		expect(await deps.stores.users.getById('dev-user')).not.toBeNull();
		expect(await deps.stores.tokens.get('dev-user')).not.toBeNull();
	});

	it('accepts a custom fake identity and only redirects to a safe path', async () => {
		const deps = { ...makeDeps(), devAuth: true };
		const app = makeApp(deps);

		const res = await app.request('/dev-login?userId=u9&email=a@b.com&name=Ada%20Lovelace&returnTo=https://evil.example');
		expect(res.headers.get('location')).toBe('/'); // open-redirect rejected
		expect(await deps.stores.users.getById('u9')).toMatchObject({
			email: 'a@b.com', displayName: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace',
		});
	});
});
