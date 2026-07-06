import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { getZohoAccessToken, type OAuthCredentials } from './zoho-auth';
import { decryptSecret, type Keyring } from './crypto';
import type { Session, Stores } from '../store/types';

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
	oauth: AuthOAuthConfig;
}

// Re-issue the sliding cookie/row at most this often to avoid a write per request.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function baseCookieOpts(deps: AuthDeps) {
	return { httpOnly: true, secure: deps.secureCookies, sameSite: 'Lax' as const, path: '/' };
}

/** Sets the signed session cookie with the session's remaining lifetime. */
async function setSessionCookie(c: Context, deps: AuthDeps, sessionId: string, expiresAt: number): Promise<void> {
	const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
	await setSignedCookie(c, SESSION_COOKIE, sessionId, deps.sessionSecret, { ...baseCookieOpts(deps), maxAge });
}

/** Creates a new session row + cookie for `userId`. */
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

/** Deletes the current session (row + cookie), if any. */
export async function clearSession(c: Context, deps: AuthDeps): Promise<void> {
	const sid = await getSignedCookie(c, deps.sessionSecret, SESSION_COOKIE);
	if (sid) await deps.stores.sessions.delete(sid);
	deleteCookie(c, SESSION_COOKIE, baseCookieOpts(deps));
}

/**
 * Resolves the session from the signed cookie: verifies signature, loads the
 * server-side row (authoritative), enforces expiry, and applies throttled sliding
 * expiry. Sets `c.get('userId')` on success. Returns the userId or null.
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

/** Middleware: attaches `userId` when a valid session exists; never blocks. */
export function optionalUser(deps: AuthDeps): MiddlewareHandler {
	return async (c, next) => {
		await resolveUser(c, deps);
		return next();
	};
}

/** Middleware: 401s unless a valid session exists. */
export function requireUser(deps: AuthDeps): MiddlewareHandler {
	return async (c, next) => {
		const userId = c.get('userId') ?? (await resolveUser(c, deps));
		if (!userId) return c.json({ error: 'auth_required' }, 401);
		return next();
	};
}

/** Marker error so callers can force re-authentication when a user's grant is gone. */
export class ReauthRequiredError extends Error {
	constructor(message = 'reauth_required') { super(message); this.name = 'ReauthRequiredError'; }
}

/**
 * Returns a live Zoho access token for a user, refreshing via their stored
 * refresh token. Reuses the service-account token cache (keyed by refresh-token
 * hash), so per-user tokens get independent caching/dedup/skew handling. Throws
 * {@link ReauthRequiredError} if the user has no stored token.
 */
export async function getUserToken(deps: AuthDeps, userId: string): Promise<string> {
	const stored = await deps.stores.tokens.get(userId);
	if (!stored) throw new ReauthRequiredError();
	const refreshToken = decryptSecret(stored.refreshTokenEnc, deps.keyring);
	const creds: OAuthCredentials = {
		clientId: deps.oauth.clientId,
		clientSecret: deps.oauth.clientSecret,
		refreshToken,
	};
	return getZohoAccessToken(creds);
}

/** True if the user's stored grant includes `scope`. */
export async function hasScope(deps: AuthDeps, userId: string, scope: string): Promise<boolean> {
	const stored = await deps.stores.tokens.get(userId);
	return stored?.scopes.includes(scope) ?? false;
}

/** Merges scope lists, preserving order and removing duplicates. */
export function unionScopes(...lists: string[][]): string[] {
	return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Validates a `returnTo` is a safe same-origin relative path (defeats open
 * redirects). Rejects protocol-relative (`//host`, `/\host`) and backslash /
 * control-character tricks that browsers may normalize into an absolute URL.
 */
export function safeReturnTo(value: string | undefined): string {
	if (value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n\t]/.test(value)) return value;
	return '/';
}
