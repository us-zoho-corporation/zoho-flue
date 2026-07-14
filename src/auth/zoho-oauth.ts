import { createHash, randomBytes } from 'node:crypto';

/**
 * Per-user Zoho OAuth 2.0 authorization-code flow (with PKCE). Distinct from
 * `zoho-auth.ts`, which handles the shared service-account refresh-token grant.
 * These are pure functions over `fetch` + explicit params; the Hono routes in
 * `routes.ts` supply values from `config`.
 */

/** Default Zoho accounts host (US DC). Other DCs use accounts.zoho.eu/.in/etc. */
export const DEFAULT_ACCOUNTS_BASE = 'https://accounts.zoho.com';

/**
 * Derives a Zoho product domain from an accounts-server origin, preserving its
 * data-center suffix — e.g. `zohoDomainFor('https://accounts.zoho.eu', 'www.zohoapis')`
 * returns `https://www.zohoapis.eu`. Zoho's domains share one suffix per data
 * center (accounts.zoho.<x>, www.zohoapis.<x>, desk.zoho.<x>, contacts.zoho.<x>),
 * so a single stored accounts host is enough to reach any of them correctly.
 * @param accountsBase - The data center's accounts-server origin.
 * @param productSubdomain - The product's subdomain prefix (e.g. `www.zohoapis`, `contacts.zoho`).
 * @returns The matching product domain for the same data center.
 */
export function zohoDomainFor(accountsBase: string, productSubdomain: string): string {
	const suffix = accountsBase.replace(/^https?:\/\/accounts\.zoho\./, '');
	return `https://${productSubdomain}.${suffix}`;
}

export interface PkcePair {
	verifier: string;
	challenge: string; // base64url(sha256(verifier))
}

/**
 * Encodes a buffer as unpadded base64url.
 * @param buf - The bytes to encode.
 * @returns The base64url-encoded string.
 */
const b64url = (buf: Buffer): string => buf.toString('base64url');

/**
 * Creates a PKCE verifier + S256 challenge.
 * @returns A fresh PKCE verifier/challenge pair.
 */
export function createPkcePair(): PkcePair {
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

/**
 * Creates an opaque CSRF `state` value.
 * @returns A fresh random base64url-encoded state string.
 */
export function createState(): string {
	return b64url(randomBytes(24));
}

export interface AuthorizeUrlParams {
	accountsBase?: string;
	clientId: string;
	redirectUri: string;
	scopes: string; // space-separated
	state: string;
	codeChallenge: string;
}

/**
 * Builds the Zoho consent URL the user is redirected to.
 * @param params - Authorize-request parameters (client id, redirect URI, scopes, state, PKCE challenge).
 * @returns The full Zoho `/oauth/v2/auth` URL to redirect the user to.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
	const base = params.accountsBase ?? DEFAULT_ACCOUNTS_BASE;
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: params.clientId,
		scope: params.scopes,
		redirect_uri: params.redirectUri,
		state: params.state,
		code_challenge: params.codeChallenge,
		code_challenge_method: 'S256',
		access_type: 'offline', // request a refresh token
		prompt: 'consent', // ensure a refresh token is returned on re-consent
	});
	return `${base}/oauth/v2/auth?${q.toString()}`;
}

export interface TokenResponse {
	accessToken: string;
	refreshToken: string | null; // absent if the user was already consented without prompt
	expiresIn: number; // seconds
	scopes: string[]; // granted scopes
	apiDomain: string; // e.g. https://www.zohoapis.com
}

export interface ExchangeParams {
	accountsBase?: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	code: string;
	codeVerifier: string;
}

/**
 * Exchanges an authorization code (+ PKCE verifier) for tokens.
 * @param params - Token-exchange parameters (client credentials, redirect URI, code, PKCE verifier).
 * @returns The parsed token response (access/refresh tokens, expiry, granted scopes, API domain).
 * @throws {Error} If the HTTP response is not ok, the body carries an error, or no `access_token` is returned.
 */
export async function exchangeCodeForTokens(params: ExchangeParams): Promise<TokenResponse> {
	const base = params.accountsBase ?? DEFAULT_ACCOUNTS_BASE;
	const res = await fetch(`${base}/oauth/v2/token`, {
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
	if (!res.ok) throw new Error(`Zoho code exchange failed: ${res.status}`);

	const data = (await res.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		scope?: string;
		api_domain?: string;
		error?: string;
	};
	if (data.error || !data.access_token) throw new Error(`Zoho code exchange error: ${data.error ?? 'no access_token'}`);

	const scope = (data.scope ?? '').trim();
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? null,
		expiresIn: data.expires_in ?? 3600,
		// Zoho returns granted scopes comma-delimited; tolerate spaces too.
		scopes: scope ? scope.split(/[\s,]+/) : [],
		apiDomain: data.api_domain ?? '',
	};
}

export interface ZohoUserInfo {
	userId: string; // ZUID
	email: string;
	displayName: string;
	firstName: string;
	lastName: string;
	photoId: string | null;
}

/**
 * Fetches the profile of the user who owns `accessToken`.
 * @param accessToken - A valid Zoho access token for the target user.
 * @param accountsBase - The Zoho accounts host to query; defaults to {@link DEFAULT_ACCOUNTS_BASE}.
 * @returns The user's profile info, with a non-numeric `Photo_ID` normalized to `null`.
 * @throws {Error} If the HTTP response is not ok.
 */
export async function fetchUserInfo(accessToken: string, accountsBase = DEFAULT_ACCOUNTS_BASE): Promise<ZohoUserInfo> {
	const res = await fetch(`${accountsBase}/oauth/user/info`, {
		headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
	});
	if (!res.ok) throw new Error(`Zoho user info failed: ${res.status}`);
	const data = (await res.json()) as Record<string, string>;
	const rawPhotoId = data['Photo_ID'];
	return {
		userId: data['ZUID'] ?? '',
		email: data['Email'] ?? '',
		displayName: data['Display_Name'] ?? data['First_Name'] ?? '',
		firstName: data['First_Name'] ?? '',
		lastName: data['Last_Name'] ?? '',
		photoId: /^\d+$/.test(rawPhotoId ?? '') ? rawPhotoId : null,
	};
}
