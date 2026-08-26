import { decryptSecret, type Keyring } from './crypto';
import type { DocsTokenStore } from '../store/types';

/**
 * Per-user OAuth 2.1 + PKCE client for the docs knowledge-base MCP server's
 * OWN authorization server (help-docs.zoho-forge.com — discoverable at
 * `/.well-known/oauth-authorization-server`). This is NOT a Zoho product:
 * it doesn't authenticate against accounts.zoho.com like CRM/Desk
 * (`zoho-oauth.ts`/`session.ts`), it has its own authorize/token endpoints,
 * requires PKCE, and has no Zoho-style scope-enhancement flow. Kept fully
 * self-contained (own access-token cache, own reauth tracking) rather than
 * folded into `zoho-auth.ts`/`session.ts`'s Zoho-shaped grant handling,
 * which would just create confusing branches for an unrelated provider.
 */

export interface DocsAuthorizeUrlParams {
	authorizeUrl: string;
	clientId: string;
	redirectUri: string;
	scopes: string; // space-separated
	state: string;
	codeChallenge: string;
}

/**
 * Builds the docs MCP authorization server's consent URL the user is redirected to.
 * @param params - Authorize-request parameters (server URL, client id, redirect URI, scopes, state, PKCE challenge).
 * @returns The full `/authorize` URL to redirect the user to.
 */
export function buildDocsAuthorizeUrl(params: DocsAuthorizeUrlParams): string {
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: params.clientId,
		redirect_uri: params.redirectUri,
		scope: params.scopes,
		state: params.state,
		code_challenge: params.codeChallenge,
		code_challenge_method: 'S256',
	});
	return `${params.authorizeUrl}?${q.toString()}`;
}

export interface DocsTokenResponse {
	accessToken: string;
	refreshToken: string | null;
	expiresIn: number; // seconds
}

export interface DocsExchangeParams {
	tokenUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	code: string;
	codeVerifier: string;
}

/**
 * Exchanges an authorization code (+ PKCE verifier) for tokens.
 * @param params - Token-exchange parameters (token URL, client credentials, redirect URI, code, PKCE verifier).
 * @returns The parsed token response (access/refresh tokens, expiry).
 * @throws {Error} If the HTTP response is not ok, the body carries an error, or no `access_token` is returned.
 */
export async function exchangeDocsCodeForTokens(params: DocsExchangeParams): Promise<DocsTokenResponse> {
	const res = await fetch(params.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: params.clientId,
			client_secret: params.clientSecret,
			redirect_uri: params.redirectUri,
			code: params.code,
			code_verifier: params.codeVerifier,
		}),
	});
	if (!res.ok) throw new Error(`Docs MCP code exchange failed: ${res.status}`);

	const data = (await res.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		error?: string;
	};
	if (data.error || !data.access_token) throw new Error(`Docs MCP code exchange error: ${data.error ?? 'no access_token'}`);

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? null,
		expiresIn: data.expires_in ?? 3600,
	};
}

/** Thrown when the user has never connected the docs knowledge base at all. */
export class DocsNotConnectedError extends Error {
	/** Constructs the error with a fixed message. */
	constructor() { super('docs_not_connected'); this.name = 'DocsNotConnectedError'; }
}

/** Thrown when a stored refresh token exists but the docs AS rejected it (revoked/expired). */
export class DocsReauthRequiredError extends Error {
	/** Constructs the error with a fixed message. */
	constructor() { super('docs_reauth_required'); this.name = 'DocsReauthRequiredError'; }
}

// Refresh 5 minutes early to absorb clock skew (mirrors zoho-auth.ts).
const SKEW_MS = 5 * 60 * 1000;

interface CacheEntry {
	token: string;
	expiresAt: number;
	inflight?: Promise<string>;
}

// Anchored to globalThis so HMR module re-evaluation doesn't reset the cache
// (mirrors zoho-auth.ts's token cache). Keyed by userId — unlike the shared
// service-account cache, there's exactly one docs credential per user.
const cache: Map<string, CacheEntry> = (
	(globalThis as Record<string, unknown>).__docsTokenCache as Map<string, CacheEntry> | undefined
) ?? (() => {
	const m = new Map<string, CacheEntry>();
	(globalThis as Record<string, unknown>).__docsTokenCache = m;
	return m;
})();

// Users whose stored refresh token is known-dead — cleared once a fresh
// token is stored (reconnect). Mirrors the reference implementation's
// `_reauth_flags`, scoped to this module instead of a whole product.
const reauthFlags: Set<string> = (
	(globalThis as Record<string, unknown>).__docsReauthFlags as Set<string> | undefined
) ?? (() => {
	const s = new Set<string>();
	(globalThis as Record<string, unknown>).__docsReauthFlags = s;
	return s;
})();

/**
 * True if `userId`'s stored docs refresh token is known-dead (a prior refresh
 * attempt got rejected) — used to report `reauth_required` on the Connections list.
 * @param userId - The user id to check.
 * @returns Whether the user's docs connection needs to be re-established.
 */
export function needsDocsReauth(userId: string): boolean {
	return reauthFlags.has(userId);
}

/**
 * Drops any cached access token and reauth flag for a user — call after
 * storing a fresh token (reconnect) or on disconnect, so stale in-memory
 * state can't outlive the stored row it was derived from.
 * @param userId - The user id to evict.
 */
export function forgetDocsToken(userId: string): void {
	cache.delete(userId);
	reauthFlags.delete(userId);
}

export interface DocsOauthDeps {
	stores: { docsTokens: DocsTokenStore };
	keyring: Keyring;
	clientId: string;
	clientSecret: string;
	tokenUrl: string;
}

/**
 * Calls the docs MCP token endpoint to refresh an access token.
 * @param deps - Docs OAuth client credentials + token endpoint.
 * @param userId - The user id being refreshed (flagged for reauth on a definitive rejection).
 * @param refreshToken - The user's decrypted refresh token.
 * @returns The new access token and its absolute expiry (ms since epoch).
 * @throws {DocsReauthRequiredError} If the authorization server rejects the refresh token (400/401).
 * @throws {Error} If the HTTP response is otherwise not ok, or the response body has no `access_token`.
 */
async function refreshDocsAccessToken(deps: DocsOauthDeps, userId: string, refreshToken: string): Promise<{ token: string; expiresAt: number }> {
	const res = await fetch(deps.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: deps.clientId,
			client_secret: deps.clientSecret,
			refresh_token: refreshToken,
		}),
	});
	if (res.status === 400 || res.status === 401) {
		reauthFlags.add(userId);
		throw new DocsReauthRequiredError();
	}
	if (!res.ok) throw new Error(`Docs MCP token refresh failed: ${res.status}`);

	const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
	if (data.error || !data.access_token) throw new Error(`Docs MCP token refresh error: ${data.error}`);

	reauthFlags.delete(userId);
	return { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
}

/**
 * Loads a user's stored refresh token and exchanges it for a fresh access token.
 * @param deps - Stores, keyring, and docs OAuth client credentials.
 * @param userId - The user id to resolve a token for.
 * @returns The new access token and its absolute expiry (ms since epoch).
 * @throws {DocsNotConnectedError} If the user has never connected the docs knowledge base.
 * @throws {DocsReauthRequiredError} If the stored refresh token has been revoked/expired.
 * @throws {Error} If the underlying refresh request fails for another reason.
 */
async function loadAndRefresh(deps: DocsOauthDeps, userId: string): Promise<{ token: string; expiresAt: number }> {
	const stored = await deps.stores.docsTokens.get(userId);
	if (!stored) throw new DocsNotConnectedError();
	const refreshToken = decryptSecret(stored.refreshTokenEnc, deps.keyring);
	return refreshDocsAccessToken(deps, userId, refreshToken);
}

/**
 * Returns a valid docs MCP access token for a user, refreshing via their
 * stored (encrypted) refresh token when the cached one is near expiry.
 * Concurrent callers for the same user share one in-flight refresh — the
 * cache placeholder is set synchronously (before any `await`), the same way
 * `zoho-auth.ts`'s cache dedupes concurrent refreshes; moving the store
 * lookup inside {@link loadAndRefresh} (run only once `inflight` is chained)
 * keeps that guarantee, unlike awaiting it up front here.
 * @param deps - Stores, keyring, and docs OAuth client credentials.
 * @param userId - The user id to resolve a token for.
 * @returns A valid docs MCP access token.
 * @throws {DocsNotConnectedError} If the user has never connected the docs knowledge base.
 * @throws {DocsReauthRequiredError} If the stored refresh token has been revoked/expired.
 * @throws {Error} If the underlying refresh request fails for another reason.
 */
export async function getDocsAccessToken(deps: DocsOauthDeps, userId: string): Promise<string> {
	const entry = cache.get(userId);
	if (entry) {
		if (Date.now() < entry.expiresAt - SKEW_MS) return entry.token;
		if (entry.inflight) return entry.inflight;
	}

	const placeholder: CacheEntry = { token: entry?.token ?? '', expiresAt: 0 };
	placeholder.inflight = loadAndRefresh(deps, userId).then(({ token, expiresAt }) => {
		cache.set(userId, { token, expiresAt });
		return token;
	}).catch((err) => {
		const current = cache.get(userId);
		if (current) current.inflight = undefined;
		else cache.delete(userId);
		throw err;
	});

	cache.set(userId, placeholder);
	return placeholder.inflight;
}
