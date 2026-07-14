import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { evictZohoToken, getZohoAccessToken } from './zoho-auth';

const opts = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

beforeEach(() => evictZohoToken(opts));
afterEach(() => vi.restoreAllMocks());

/**
 * Builds a mock `fetch` that resolves successfully with a Zoho-shaped token response.
 * @param token - The `access_token` value the mock response should return.
 * @param expiresIn - The `expires_in` value (seconds) the mock response should return.
 * @returns A vitest mock function suitable for `vi.stubGlobal('fetch', ...)`.
 */
function mockFetch(token: string, expiresIn = 3600) {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({ access_token: token, expires_in: expiresIn }),
	});
}

describe('getZohoAccessToken', () => {
	it('returns the access token on success', async () => {
		vi.stubGlobal('fetch', mockFetch('tok_abc'));
		await expect(getZohoAccessToken(opts)).resolves.toBe('tok_abc');
	});

	it('throws when response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => 'Unauthorized',
		}));
		await expect(getZohoAccessToken(opts)).rejects.toThrow('Zoho token refresh failed: 401');
	});

	it('throws when response body contains an error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ error: 'invalid_client' }),
		}));
		await expect(getZohoAccessToken(opts)).rejects.toThrow('invalid_client');
	});

	it('sends credentials as form-encoded body', async () => {
		const fetchMock = mockFetch('tok_abc');
		vi.stubGlobal('fetch', fetchMock);
		await getZohoAccessToken(opts);

		const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('grant_type')).toBe('refresh_token');
		expect(body.get('client_id')).toBe('id');
		expect(body.get('refresh_token')).toBe('refresh');
	});

	it('defaults to the US accounts domain when accountsBase is omitted', async () => {
		const fetchMock = mockFetch('tok_abc');
		vi.stubGlobal('fetch', fetchMock);
		await getZohoAccessToken(opts);
		expect(fetchMock.mock.calls[0][0]).toBe('https://accounts.zoho.com/oauth/v2/token');
	});

	it('refreshes against the credential-supplied data center, not always the US domain', async () => {
		const euOpts = { ...opts, refreshToken: 'refresh-eu', accountsBase: 'https://accounts.zoho.eu' };
		evictZohoToken(euOpts);
		const fetchMock = mockFetch('tok_eu');
		vi.stubGlobal('fetch', fetchMock);
		await getZohoAccessToken(euOpts);
		expect(fetchMock.mock.calls[0][0]).toBe('https://accounts.zoho.eu/oauth/v2/token');
	});

	it('returns cached token without re-fetching', async () => {
		const fetchMock = mockFetch('tok_cached');
		vi.stubGlobal('fetch', fetchMock);

		await getZohoAccessToken(opts);
		const second = await getZohoAccessToken(opts);

		expect(second).toBe('tok_cached');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('deduplicates concurrent refresh calls into a single fetch', async () => {
		const fetchMock = mockFetch('tok_dedup');
		vi.stubGlobal('fetch', fetchMock);

		const [a, b, c] = await Promise.all([
			getZohoAccessToken(opts),
			getZohoAccessToken(opts),
			getZohoAccessToken(opts),
		]);

		expect(a).toBe('tok_dedup');
		expect(b).toBe('tok_dedup');
		expect(c).toBe('tok_dedup');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('re-fetches after eviction', async () => {
		const fetchMock = mockFetch('tok_new');
		vi.stubGlobal('fetch', fetchMock);

		await getZohoAccessToken(opts);
		evictZohoToken(opts);
		await getZohoAccessToken(opts);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('re-fetches when token is within skew window', async () => {
		vi.useFakeTimers();
		const fetchMock = mockFetch('tok_fresh', 3600);
		vi.stubGlobal('fetch', fetchMock);

		await getZohoAccessToken(opts);
		// Advance past expires_in minus skew (3600s - 300s = 3300s)
		vi.advanceTimersByTime((3600 - 300) * 1000 + 1);
		await getZohoAccessToken(opts);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});
});
