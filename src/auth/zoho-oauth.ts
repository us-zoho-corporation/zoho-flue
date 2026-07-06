import { createHash, randomBytes } from 'node:crypto';

/**
 * Per-user Zoho OAuth 2.0 authorization-code flow (with PKCE). Distinct from
 * `zoho-auth.ts`, which handles the shared service-account refresh-token grant.
 * These are pure functions over `fetch` + explicit params; the Hono routes in
 * `routes.ts` supply values from `config`.
 */

/** Default Zoho accounts host (US DC). Other DCs use accounts.zoho.eu/.in/etc. */
export const DEFAULT_ACCOUNTS_BASE = 'https://accounts.zoho.com';

export interface PkcePair {
	verifier: string;
	challenge: string; // base64url(sha256(verifier))
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** Creates a PKCE verifier + S256 challenge. */
export function createPkcePair(): PkcePair {
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

/** Creates an opaque CSRF `state` value. */
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

/** Builds the Zoho consent URL the user is redirected to. */
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

/** Exchanges an authorization code (+ PKCE verifier) for tokens. */
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

/** Fetches the profile of the user who owns `accessToken`. */
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
