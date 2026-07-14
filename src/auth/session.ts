import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { getZohoAccessToken, type OAuthCredentials } from './zoho-auth';
import { decryptSecret, type Keyring } from './crypto';
import type { Session, Stores } from '../store/types';
import type { ZohoProduct } from '../config';

// Make `userId` a typed context variable across the app.
declare module 'hono' {
	interface ContextVariableMap {
		userId?: string;
	}
}

export const SESSION_COOKIE = 'flue_sid';
export const LOGIN_COOKIE = 'flue_login';

/** OAuth client settings the auth flow needs (supplied from config by app.ts). */
export interface AuthOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	loginScopes: string;
	accountsBase?: string;
}

export interface AuthDeps {
	stores: Stores;
	keyring: Keyring;
	sessionSecret: string;
	sessionTtlSeconds: number;
	/** Set the `Secure` cookie flag (true in production / https). */
	secureCookies: boolean;
	/** Dev/CI only: enable /api/auth/dev-login (fake user, no Zoho). Never in prod. */
	devAuth: boolean;
	oauth: AuthOAuthConfig;
	/** Per-product scope bundles the settings "Connections" panel offers. */
	products: readonly ZohoProduct[];
}

// Re-issue the sliding cookie/row at most this often to avoid a write per request.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Common cookie attributes shared by the session and login cookies.
 * @param deps - Auth dependencies; only `secureCookies` is consulted.
 * @returns The shared cookie options (httpOnly, secure, sameSite, path).
 */
function baseCookieOpts(deps: AuthDeps) {
	return { httpOnly: true, secure: deps.secureCookies, sameSite: 'Lax' as const, path: '/' };
}

/**
 * Sets the signed session cookie with the session's remaining lifetime.
 * @param c - The Hono request context to set the cookie on.
 * @param deps - Auth dependencies (session secret, cookie flags).
 * @param sessionId - The session id to store in the cookie.
 * @param expiresAt - Absolute expiry (ms since epoch), used to derive the cookie's `maxAge`.
 */
async function setSessionCookie(c: Context, deps: AuthDeps, sessionId: string, expiresAt: number): Promise<void> {
	const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
	await setSignedCookie(c, SESSION_COOKIE, sessionId, deps.sessionSecret, { ...baseCookieOpts(deps), maxAge });
}

/**
 * Creates a new session row + cookie for `userId`.
 * @param c - The Hono request context to set the session cookie on.
 * @param deps - Auth dependencies (stores, session TTL, cookie flags).
 * @param userId - The user id the session belongs to.
 * @returns The newly created session row.
 */
export async function issueSession(c: Context, deps: AuthDeps, userId: string): Promise<Session> {
	const now = Date.now();
	const session: Session = {
		sessionId: randomBytes(32).toString('base64url'),
		userId,
		createdAt: now,
		expiresAt: now + deps.sessionTtlSeconds * 1000,
		lastSeenAt: now,
	};
	await deps.stores.sessions.create(session);
	await setSessionCookie(c, deps, session.sessionId, session.expiresAt);
	c.set('userId', userId);
	return session;
}

/**
 * Deletes the current session (row + cookie), if any.
 * @param c - The Hono request context holding the session cookie.
 * @param deps - Auth dependencies (stores, session secret, cookie flags).
 */
export async function clearSession(c: Context, deps: AuthDeps): Promise<void> {
	const sid = await getSignedCookie(c, deps.sessionSecret, SESSION_COOKIE);
	if (sid) await deps.stores.sessions.delete(sid);
	deleteCookie(c, SESSION_COOKIE, baseCookieOpts(deps));
}

/**
 * Resolves the session from the signed cookie: verifies signature, loads the
 * server-side row (authoritative), enforces expiry, and applies throttled sliding
 * expiry. Sets `c.get('userId')` on success. Returns the userId or null.
 * @param c - The Hono request context holding the session cookie.
 * @param deps - Auth dependencies (stores, session secret/TTL, cookie flags).
 * @returns The resolved user id, or `null` if there is no valid session.
 */
export async function resolveUser(c: Context, deps: AuthDeps): Promise<string | null> {
	const sid = await getSignedCookie(c, deps.sessionSecret, SESSION_COOKIE);
	if (!sid) return null;

	const session = await deps.stores.sessions.get(sid);
	const now = Date.now();
	if (!session || session.expiresAt <= now) {
		// Stale or forged id — clear the cookie and (if present) the row.
		if (session) await deps.stores.sessions.delete(sid);
		deleteCookie(c, SESSION_COOKIE, baseCookieOpts(deps));
		return null;
	}

	if (now - session.lastSeenAt > TOUCH_INTERVAL_MS) {
		const expiresAt = now + deps.sessionTtlSeconds * 1000;
		await deps.stores.sessions.touch(sid, now, expiresAt);
		await setSessionCookie(c, deps, sid, expiresAt);
	}

	c.set('userId', session.userId);
	return session.userId;
}

/**
 * Middleware: attaches `userId` when a valid session exists; never blocks.
 * @param deps - Auth dependencies (stores, session secret/TTL, cookie flags).
 * @returns A Hono middleware handler that resolves the session and always calls `next()`.
 */
export function optionalUser(deps: AuthDeps): MiddlewareHandler {
	return async (c, next) => {
		await resolveUser(c, deps);
		return next();
	};
}

/**
 * Middleware: 401s unless a valid session exists.
 * @param deps - Auth dependencies (stores, session secret/TTL, cookie flags).
 * @returns A Hono middleware handler that responds `401` when unauthenticated, otherwise calls `next()`.
 */
export function requireUser(deps: AuthDeps): MiddlewareHandler {
	return async (c, next) => {
		const userId = c.get('userId') ?? (await resolveUser(c, deps));
		if (!userId) return c.json({ error: 'auth_required' }, 401);
		return next();
	};
}

/** Marker error so callers can force re-authentication when a user's grant is gone. */
export class ReauthRequiredError extends Error {
	/**
	 * @param message - Error message; defaults to `'reauth_required'`.
	 */
	constructor(message = 'reauth_required') { super(message); this.name = 'ReauthRequiredError'; }
}

/**
 * Returns a live Zoho access token for a user, refreshing via their stored
 * refresh token. Reuses the service-account token cache (keyed by refresh-token
 * hash), so per-user tokens get independent caching/dedup/skew handling.
 * @param deps - Auth dependencies (stores, keyring, oauth client credentials).
 * @param userId - The user id to resolve a token for.
 * @returns A live Zoho access token for `userId`.
 * @throws {ReauthRequiredError} If the user has no stored token.
 */
export async function getUserToken(deps: AuthDeps, userId: string): Promise<string> {
	const stored = await deps.stores.tokens.get(userId);
	if (!stored) throw new ReauthRequiredError();
	const refreshToken = decryptSecret(stored.refreshTokenEnc, deps.keyring);
	const creds: OAuthCredentials = {
		clientId: deps.oauth.clientId,
		clientSecret: deps.oauth.clientSecret,
		refreshToken,
		// The data center this specific user's grant was issued from — captured
		// at consent time (routes.ts) and previously never read back here, which
		// meant every per-user refresh silently ignored it and always hit the US
		// endpoint regardless, failing with "invalid_code" for any other DC.
		accountsBase: stored.accountsServer,
	};
	return getZohoAccessToken(creds);
}

/**
 * True if the user's stored grant includes `scope`.
 * @param deps - Auth dependencies (stores).
 * @param userId - The user id to check.
 * @param scope - The OAuth scope to look for.
 * @returns Whether the user's stored token includes `scope`.
 */
export async function hasScope(deps: AuthDeps, userId: string, scope: string): Promise<boolean> {
	const stored = await deps.stores.tokens.get(userId);
	return stored?.scopes.includes(scope) ?? false;
}

/**
 * Merges scope lists, preserving order and removing duplicates.
 * @param lists - Any number of scope-string arrays to merge.
 * @returns The de-duplicated union of all scopes, in first-seen order.
 */
export function unionScopes(...lists: string[][]): string[] {
	return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Validates a `returnTo` is a safe same-origin relative path (defeats open
 * redirects). Rejects protocol-relative (`//host`, `/\host`) and backslash /
 * control-character tricks that browsers may normalize into an absolute URL.
 * @param value - The candidate `returnTo` value, typically from a query string.
 * @returns `value` if it is a safe same-origin relative path, otherwise `'/'`.
 */
export function safeReturnTo(value: string | undefined): string {
	if (value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n\t]/.test(value)) return value;
	return '/';
}
