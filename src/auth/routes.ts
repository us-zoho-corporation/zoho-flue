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

/** Builds the `/api/auth` sub-app (login, callback, logout, me). */
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

/** Bundles the auth sub-app + middleware + per-user token helpers for app.ts and the agent route. */
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
