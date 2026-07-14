import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { getUserToken, safeReturnTo, unionScopes, type AuthDeps } from './session';
import { encryptSecret, parseKeyring } from './crypto';
import { createMemoryStores } from '../store/memory/memory-stores';

afterEach(() => vi.restoreAllMocks());

describe('safeReturnTo', () => {
	it('accepts same-origin relative paths', () => {
		expect(safeReturnTo('/')).toBe('/');
		expect(safeReturnTo('/chat')).toBe('/chat');
		expect(safeReturnTo('/chat?tab=1#x')).toBe('/chat?tab=1#x');
	});

	it('rejects open-redirect vectors, falling back to /', () => {
		expect(safeReturnTo(undefined)).toBe('/');
		expect(safeReturnTo('')).toBe('/');
		expect(safeReturnTo('https://evil.com')).toBe('/');
		expect(safeReturnTo('//evil.com')).toBe('/'); // protocol-relative
		expect(safeReturnTo('/\\evil.com')).toBe('/'); // backslash → normalized to //
		expect(safeReturnTo('/\tevil')).toBe('/'); // control char
		expect(safeReturnTo('/foo\r\nSet-Cookie: x')).toBe('/'); // header injection
		expect(safeReturnTo('javascript:alert(1)')).toBe('/');
	});
});

describe('unionScopes', () => {
	it('merges lists, preserving order and de-duplicating', () => {
		expect(unionScopes(['a', 'b'], ['b', 'c'], [''])).toEqual(['a', 'b', 'c']);
	});
});

describe('getUserToken', () => {
	/**
	 * Builds `AuthDeps` backed by fresh in-memory stores and a throwaway keyring,
	 * for tests that only need `getUserToken`'s refresh path.
	 * @returns Minimal `AuthDeps` suitable for `getUserToken`.
	 */
	function makeDeps(): AuthDeps {
		return {
			stores: createMemoryStores(),
			keyring: parseKeyring(`k1:${randomBytes(32).toString('base64')}`),
			sessionSecret: 'sess-secret',
			sessionTtlSeconds: 3600,
			secureCookies: false,
			devAuth: false,
			oauth: { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://x/callback', loginScopes: '' },
			products: [],
		};
	}

	it('refreshes against the data center recorded for this specific user, not a hardcoded default', async () => {
		// Regression test: accountsServer was captured per-user at consent time
		// but never read back here, so every refresh silently used the US
		// endpoint regardless — failing with "invalid_code" for any other DC.
		const deps = makeDeps();
		await deps.stores.tokens.put({
			userId: 'u1',
			refreshTokenEnc: encryptSecret('refresh-eu', deps.keyring),
			scopes: [],
			accountsServer: 'https://accounts.zoho.eu',
			updatedAt: Date.now(),
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'tok-eu', expires_in: 3600 }),
		});
		vi.stubGlobal('fetch', fetchMock);

		await getUserToken(deps, 'u1');
		expect(fetchMock.mock.calls[0][0]).toBe('https://accounts.zoho.eu/oauth/v2/token');
	});
});
