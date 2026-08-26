import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPkcePair, createState } from './zoho-oauth';
import { encryptSecret, parseKeyring } from './crypto';
import {
	buildDocsAuthorizeUrl,
	exchangeDocsCodeForTokens,
	forgetDocsToken,
	getDocsAccessToken,
	needsDocsReauth,
	DocsNotConnectedError,
	DocsReauthRequiredError,
	type DocsOauthDeps,
} from './docs-oauth';
import type { DocsToken, DocsTokenStore } from '../store/types';

afterEach(() => vi.restoreAllMocks());

describe('createPkcePair / createState (reused from zoho-oauth.ts)', () => {
	it('derives an S256 challenge from the verifier', () => {
		const { verifier, challenge } = createPkcePair();
		expect(challenge).toBe(createHash('sha256').update(verifier).digest().toString('base64url'));
	});
});

describe('buildDocsAuthorizeUrl', () => {
	it('includes PKCE, scopes, redirect, and state — no Zoho-only access_type/prompt', () => {
		const url = new URL(buildDocsAuthorizeUrl({
			authorizeUrl: 'https://help-docs.zoho-forge.com/authorize',
			clientId: 'docs-cid',
			redirectUri: 'http://localhost:3583/api/auth/docs/callback',
			scopes: 'openid profile email',
			state: 'st8',
			codeChallenge: 'chal',
		}));
		expect(url.origin + url.pathname).toBe('https://help-docs.zoho-forge.com/authorize');
		const p = url.searchParams;
		expect(p.get('response_type')).toBe('code');
		expect(p.get('client_id')).toBe('docs-cid');
		expect(p.get('redirect_uri')).toBe('http://localhost:3583/api/auth/docs/callback');
		expect(p.get('scope')).toBe('openid profile email');
		expect(p.get('state')).toBe('st8');
		expect(p.get('code_challenge')).toBe('chal');
		expect(p.get('code_challenge_method')).toBe('S256');
		expect(p.has('access_type')).toBe(false);
		expect(p.has('prompt')).toBe(false);
	});
});

describe('exchangeDocsCodeForTokens', () => {
	const params = {
		tokenUrl: 'https://help-docs.zoho-forge.com/token',
		clientId: 'docs-cid',
		clientSecret: 'docs-secret',
		redirectUri: 'http://localhost:3583/api/auth/docs/callback',
		code: 'auth-code',
		codeVerifier: 'verifier-xyz',
	};

	it('sends the authorization_code grant with the PKCE verifier and parses tokens', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
		});
		vi.stubGlobal('fetch', fetchMock);

		expect(await exchangeDocsCodeForTokens(params)).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 });
		expect(fetchMock.mock.calls[0][0]).toBe('https://help-docs.zoho-forge.com/token');
		const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('grant_type')).toBe('authorization_code');
		expect(body.get('code_verifier')).toBe('verifier-xyz');
	});

	it('throws when the token response carries an error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'invalid_grant' }) }));
		await expect(exchangeDocsCodeForTokens(params)).rejects.toThrow('invalid_grant');
	});

	it('throws on a non-ok HTTP status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		await expect(exchangeDocsCodeForTokens(params)).rejects.toThrow('400');
	});
});

/** Minimal in-memory `DocsTokenStore` fake for `getDocsAccessToken` tests. */
function fakeDocsTokenStore(initial?: DocsToken): DocsTokenStore {
	let row: DocsToken | null = initial ?? null;
	return {
		async put(token) { row = token; },
		async get() { return row; },
		async delete() { row = null; },
	};
}

describe('getDocsAccessToken', () => {
	const keyring = parseKeyring(`k1:${randomBytes(32).toString('base64')}`);
	const userId = 'u1';
	let deps: DocsOauthDeps;

	beforeEach(() => {
		forgetDocsToken(userId);
		deps = {
			stores: { docsTokens: fakeDocsTokenStore({ userId, refreshTokenEnc: encryptSecret('rt-1', keyring), updatedAt: 0 }) },
			keyring,
			clientId: 'docs-cid',
			clientSecret: 'docs-secret',
			tokenUrl: 'https://help-docs.zoho-forge.com/token',
		};
	});

	it('throws DocsNotConnectedError when the user has no stored token', async () => {
		forgetDocsToken('nobody');
		const empty = { ...deps, stores: { docsTokens: fakeDocsTokenStore() } };
		await expect(getDocsAccessToken(empty, 'nobody')).rejects.toBeInstanceOf(DocsNotConnectedError);
	});

	it('refreshes and returns a fresh access token', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'at-1', expires_in: 3600 }) }));
		await expect(getDocsAccessToken(deps, userId)).resolves.toBe('at-1');
	});

	it('caches the access token and does not re-fetch until near expiry', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'at-1', expires_in: 3600 }) });
		vi.stubGlobal('fetch', fetchMock);
		await getDocsAccessToken(deps, userId);
		await getDocsAccessToken(deps, userId);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('deduplicates concurrent refresh calls into a single fetch', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'at-dedup', expires_in: 3600 }) });
		vi.stubGlobal('fetch', fetchMock);
		const [a, b] = await Promise.all([getDocsAccessToken(deps, userId), getDocsAccessToken(deps, userId)]);
		expect(a).toBe('at-dedup');
		expect(b).toBe('at-dedup');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws DocsReauthRequiredError and flags the user when the token endpoint rejects the refresh token', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
		await expect(getDocsAccessToken(deps, userId)).rejects.toBeInstanceOf(DocsReauthRequiredError);
		expect(needsDocsReauth(userId)).toBe(true);
	});

	it('clears the reauth flag once a fresh refresh succeeds', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
		await expect(getDocsAccessToken(deps, userId)).rejects.toBeInstanceOf(DocsReauthRequiredError);
		expect(needsDocsReauth(userId)).toBe(true);

		forgetDocsToken(userId); // reconnect: fresh token stored, cache/flag evicted
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'at-2', expires_in: 3600 }) }));
		await expect(getDocsAccessToken(deps, userId)).resolves.toBe('at-2');
		expect(needsDocsReauth(userId)).toBe(false);
	});
});
