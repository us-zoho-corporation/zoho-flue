import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { encryptSecret } from './crypto';
import {
	buildAuthorizeUrl,
	createPkcePair,
	createState,
	exchangeCodeForTokens,
	fetchUserInfo,
} from './zoho-oauth';
import {
	clearSession,
	getUserToken,
	issueSession,
	optionalUser,
	requireUser,
	resolveUser,
	safeReturnTo,
	unionScopes,
	LOGIN_COOKIE,
	type AuthDeps,
} from './session';
import { safeEqual } from './crypto';

interface LoginState {
	state: string;
	verifier: string;
	returnTo: string;
}

/**
 * Builds the `/api/auth` sub-app (login, callback, logout, me).
 * @param deps - Auth dependencies (stores, keyring, session/oauth config).
 * @returns A Hono sub-app mountable at `/api/auth`.
 */
export function createAuthRoutes(deps: AuthDeps): Hono {
	const app = new Hono();
	const cookieOpts = { httpOnly: true, secure: deps.secureCookies, sameSite: 'Lax' as const, path: '/' };

	// Step 1 — redirect the user to Zoho consent.
	app.get('/login', async (c) => {
		const { verifier, challenge } = createPkcePair();
		const state = createState();
		const returnTo = safeReturnTo(c.req.query('returnTo'));

		// Optional incremental scopes; always include the configured login scopes.
		// Zoho expects a comma-delimited scope list; accept comma/space on input.
		const requested = c.req.query('scopes');
		const scopes = unionScopes(deps.oauth.loginScopes.split(/[\s,]+/), requested ? requested.split(/[\s,]+/) : []).join(',');

		const payload: LoginState = { state, verifier, returnTo };
		await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(payload), deps.sessionSecret, { ...cookieOpts, maxAge: 600 });

		return c.redirect(buildAuthorizeUrl({
			accountsBase: deps.oauth.accountsBase,
			clientId: deps.oauth.clientId,
			redirectUri: deps.oauth.redirectUri,
			scopes,
			state,
			codeChallenge: challenge,
		}));
	});

	// Step 2 — Zoho redirects back with a code; exchange it, persist, open a session.
	app.get('/callback', async (c) => {
		const raw = await getSignedCookie(c, deps.sessionSecret, LOGIN_COOKIE);
		deleteCookie(c, LOGIN_COOKIE, cookieOpts); // single-use
		if (!raw) return c.json({ error: 'invalid_login_state' }, 400);

		let login: LoginState;
		try { login = JSON.parse(raw) as LoginState; } catch { return c.json({ error: 'invalid_login_state' }, 400); }

		// User denied consent (or Zoho returned an error).
		if (c.req.query('error')) return c.redirect(`${login.returnTo}?auth=denied`);

		const state = c.req.query('state') ?? '';
		const code = c.req.query('code') ?? '';
		if (!code || !safeEqual(state, login.state)) return c.json({ error: 'state_mismatch' }, 403);

		const tokens = await exchangeCodeForTokens({
			accountsBase: deps.oauth.accountsBase,
			clientId: deps.oauth.clientId,
			clientSecret: deps.oauth.clientSecret,
			redirectUri: deps.oauth.redirectUri,
			code,
			codeVerifier: login.verifier,
		});

		const info = await fetchUserInfo(tokens.accessToken, deps.oauth.accountsBase);
		if (!info.userId) return c.json({ error: 'no_user_id' }, 502);

		const now = Date.now();
		const existing = await deps.stores.users.getById(info.userId);
		const existingToken = await deps.stores.tokens.get(info.userId);

		// Zoho only returns a refresh token on fresh consent; reuse the stored one otherwise.
		const refreshEnc = tokens.refreshToken
			? encryptSecret(tokens.refreshToken, deps.keyring)
			: existingToken?.refreshTokenEnc;
		if (!refreshEnc) return c.json({ error: 'no_refresh_token' }, 502);

		await deps.stores.users.upsert({
			userId: info.userId,
			email: info.email,
			displayName: info.displayName,
			firstName: info.firstName,
			lastName: info.lastName,
			photoId: info.photoId,
			createdAt: existing?.createdAt ?? now,
			lastLoginAt: now,
		});
		await deps.stores.tokens.put({
			userId: info.userId,
			refreshTokenEnc: refreshEnc,
			scopes: unionScopes(existingToken?.scopes ?? [], tokens.scopes),
			accountsServer: deps.oauth.accountsBase ?? 'https://accounts.zoho.com',
			updatedAt: now,
		});

		await issueSession(c, deps, info.userId);
		return c.redirect(login.returnTo);
	});

	// Step 3 — sign out.
	app.post('/logout', async (c) => {
		await clearSession(c, deps);
		return c.json({ ok: true });
	});

	// Session-scoped identity + granted scopes (no Zoho round-trip).
	app.get('/me', async (c) => {
		const userId = c.get('userId');
		if (!userId) return c.json({ authenticated: false });
		const [user, token] = await Promise.all([deps.stores.users.getById(userId), deps.stores.tokens.get(userId)]);
		return c.json({ authenticated: true, user, scopes: token?.scopes ?? [] });
	});

	// Per-product connection status for the settings "Connections" panel: whether
	// the signed-in user's stored grant already covers each product's full scope
	// bundle. Drives which products show "Connect" vs. "Connected".
	app.get('/connections', async (c) => {
		const userId = c.get('userId');
		const token = userId ? await deps.stores.tokens.get(userId) : null;
		const granted = new Set(token?.scopes ?? []);
		const connections = deps.products.map((product) => ({
			key: product.key,
			label: product.label,
			description: product.description,
			scopes: product.scopes,
			connected: product.scopes.every((scope) => granted.has(scope)),
		}));
		return c.json({ connections });
	});

	// Disconnects a product: drops its scope bundle from the user's stored grant
	// (locally — Zoho's own consent record is unaffected, so re-connecting doesn't
	// need a fresh consent screen). No-op if the user never granted those scopes.
	app.post('/connections/:key/disconnect', async (c) => {
		const userId = c.get('userId');
		if (!userId) return c.json({ error: 'auth_required' }, 401);
		const product = deps.products.find((p) => p.key === c.req.param('key'));
		if (!product) return c.json({ error: 'unknown_product' }, 404);

		const token = await deps.stores.tokens.get(userId);
		if (token) {
			const drop = new Set(product.scopes);
			await deps.stores.tokens.put({ ...token, scopes: token.scopes.filter((s) => !drop.has(s)), updatedAt: Date.now() });
		}
		return c.json({ ok: true });
	});

	// Local/CI ONLY: mint a session for a fake user without Zoho — the test seam used
	// by the e2e-chat harness. 404s unless ENV=local|CI (deps.devAuth). Never in prod.
	app.get('/dev-login', async (c) => {
		if (!deps.devAuth) return c.notFound();
		const userId = c.req.query('userId') || 'dev-user';
		const email = c.req.query('email') || 'dev@example.com';
		const name = c.req.query('name') || 'Dev User';
		const [firstName, ...rest] = name.trim().split(/\s+/);
		const now = Date.now();
		const existing = await deps.stores.users.getById(userId);
		await deps.stores.users.upsert({
			userId, email, displayName: name,
			firstName: firstName || 'Dev', lastName: rest.join(' ') || 'User',
			photoId: null, createdAt: existing?.createdAt ?? now, lastLoginAt: now,
		});
		// Optional `scopes` param (comma/space-separated) lets a test simulate an
		// already-connected product (e.g. Zoho CRM's full bundle) without a real
		// Zoho OAuth round-trip — unioned with the base scopes, same as a real
		// incremental-authorization grant would be.
		const extraScopes = c.req.query('scopes');
		await deps.stores.tokens.put({
			userId,
			// Placeholder — can't be refreshed against Zoho; fine for Claude + empty-state UX.
			refreshTokenEnc: encryptSecret('dev-refresh-token-not-usable', deps.keyring),
			scopes: unionScopes(['AaaServer.profile.READ', 'QuickML.deployment.READ'], extraScopes ? extraScopes.split(/[\s,]+/) : []),
			accountsServer: 'https://accounts.zoho.com',
			updatedAt: now,
		});
		await issueSession(c, deps, userId);
		return c.redirect(safeReturnTo(c.req.query('returnTo')));
	});

	return app;
}

export interface Auth {
	routes: Hono;
	optionalUser: MiddlewareHandler;
	requireUser: MiddlewareHandler;
	/** Live Zoho access token for a user (refreshes via their stored token). */
	getUserToken(userId: string): Promise<string>;
	/** Resolves the request's logged-in user id (from the session cookie), or null. */
	resolveUserId(c: Context): Promise<string | null>;
	/** Resolves the request's logged-in user and returns their live token, or null. */
	resolveUserToken(c: Context): Promise<string | null>;
}

/**
 * Bundles the auth sub-app + middleware + per-user token helpers for app.ts and the agent route.
 * @param deps - Auth dependencies (stores, keyring, session/oauth config).
 * @returns The `Auth` bundle exposing routes, middleware, and per-user token resolution.
 */
export function createAuth(deps: AuthDeps): Auth {
	return {
		routes: createAuthRoutes(deps),
		optionalUser: optionalUser(deps),
		requireUser: requireUser(deps),
		getUserToken: (userId: string) => getUserToken(deps, userId),
		resolveUserId: (c: Context) => resolveUser(c, deps),
		resolveUserToken: async (c: Context) => {
			const userId = await resolveUser(c, deps);
			if (!userId) return null;
			try {
				return await getUserToken(deps, userId);
			} catch {
				// No stored token / revoked grant — treat as unauthenticated for provider use.
				return null;
			}
		},
	};
}
