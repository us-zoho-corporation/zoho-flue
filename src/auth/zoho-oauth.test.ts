import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
	buildAuthorizeUrl,
	createPkcePair,
	createState,
	exchangeCodeForTokens,
	fetchUserInfo,
} from './zoho-oauth';

afterEach(() => vi.restoreAllMocks());

describe('createPkcePair', () => {
	it('derives an S256 challenge from the verifier', () => {
		const { verifier, challenge } = createPkcePair();
		const expected = createHash('sha256').update(verifier).digest().toString('base64url');
		expect(challenge).toBe(expected);
	});
	it('produces unique pairs and states', () => {
		expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
		expect(createState()).not.toBe(createState());
	});
});

describe('buildAuthorizeUrl', () => {
	it('includes PKCE, offline access, scopes, redirect, and state', () => {
		const url = new URL(buildAuthorizeUrl({
			clientId: 'cid',
			redirectUri: 'http://localhost:3583/api/auth/callback',
			scopes: 'AaaServer.profile.READ',
			state: 'st8',
			codeChallenge: 'chal',
		}));
		expect(url.origin + url.pathname).toBe('https://accounts.zoho.com/oauth/v2/auth');
		const p = url.searchParams;
		expect(p.get('response_type')).toBe('code');
		expect(p.get('client_id')).toBe('cid');
		expect(p.get('scope')).toBe('AaaServer.profile.READ');
		expect(p.get('redirect_uri')).toBe('http://localhost:3583/api/auth/callback');
		expect(p.get('state')).toBe('st8');
		expect(p.get('code_challenge')).toBe('chal');
		expect(p.get('code_challenge_method')).toBe('S256');
		expect(p.get('access_type')).toBe('offline');
	});
});

describe('exchangeCodeForTokens', () => {
	const params = {
		clientId: 'cid',
		clientSecret: 'secret',
		redirectUri: 'http://localhost:3583/api/auth/callback',
		code: 'auth-code',
		codeVerifier: 'verifier-xyz',
	};

	it('sends the authorization_code grant with the PKCE verifier and parses tokens', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: 'at', refresh_token: 'rt', expires_in: 3600,
				scope: 'AaaServer.profile.READ ZohoCRM.modules.READ', api_domain: 'https://www.zohoapis.com',
			}),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await exchangeCodeForTokens(params);
		expect(result).toEqual({
			accessToken: 'at',
			refreshToken: 'rt',
			expiresIn: 3600,
			scopes: ['AaaServer.profile.READ', 'ZohoCRM.modules.READ'],
			apiDomain: 'https://www.zohoapis.com',
		});

		const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('grant_type')).toBe('authorization_code');
		expect(body.get('code')).toBe('auth-code');
		expect(body.get('code_verifier')).toBe('verifier-xyz');
		expect(body.get('client_secret')).toBe('secret');
	});

	it('parses Zoho comma-delimited granted scopes into an array', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'at', expires_in: 3600, scope: 'AaaServer.profile.READ,QuickML.deployment.READ' }),
		}));
		expect((await exchangeCodeForTokens(params)).scopes).toEqual(['AaaServer.profile.READ', 'QuickML.deployment.READ']);
	});

	it('throws when the token response carries an error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'invalid_code' }) }));
		await expect(exchangeCodeForTokens(params)).rejects.toThrow('invalid_code');
	});

	it('throws on a non-ok HTTP status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		await expect(exchangeCodeForTokens(params)).rejects.toThrow('400');
	});
});

describe('fetchUserInfo', () => {
	it('maps ZUID and profile fields, sanitizing photo id', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ZUID: '999', Email: 'a@x.com', Display_Name: 'Ada L', First_Name: 'Ada', Last_Name: 'L', Photo_ID: '42' }),
		}));
		expect(await fetchUserInfo('tok')).toEqual({
			userId: '999', email: 'a@x.com', displayName: 'Ada L', firstName: 'Ada', lastName: 'L', photoId: '42',
		});
	});

	it('nulls a non-numeric photo id', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ZUID: '1', Email: 'a@x.com', Photo_ID: 'javascript:alert(1)' }),
		}));
		expect((await fetchUserInfo('tok')).photoId).toBeNull();
	});
});
