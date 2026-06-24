import { describe, it, expect, vi, afterEach } from 'vitest';
import { getZohoAccessToken } from './zoho-auth';

const opts = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

afterEach(() => vi.restoreAllMocks());

describe('getZohoAccessToken', () => {
	it('returns the access token on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'tok_abc' }),
		}));
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
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'tok_abc' }),
		});
		vi.stubGlobal('fetch', fetchMock);
		await getZohoAccessToken(opts);

		const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('grant_type')).toBe('refresh_token');
		expect(body.get('client_id')).toBe('id');
		expect(body.get('refresh_token')).toBe('refresh');
	});
});
