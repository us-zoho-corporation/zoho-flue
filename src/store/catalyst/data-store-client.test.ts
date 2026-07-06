import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evictZohoToken } from '../../auth/zoho-auth';
import { CatalystDataStoreClient } from './data-store-client';

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'ds-client-refresh' };

const opts = {
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	oauth,
};

/** Routes accounts.zoho.com token fetches to a stub; delegates Catalyst calls to `onCatalyst`. */
function mockFetch(onCatalyst: (url: string, init: RequestInit) => unknown) {
	return vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		return onCatalyst(String(url), init);
	});
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

beforeEach(() => evictZohoToken(oauth));
afterEach(() => vi.restoreAllMocks());

describe('CatalystDataStoreClient', () => {
	it('insertRows posts the array to the right URL with auth/org/env headers', async () => {
		const fetchMock = mockFetch(() => ok([{ ROWID: '9', UserId: 'u1' }]));
		vi.stubGlobal('fetch', fetchMock);

		const client = new CatalystDataStoreClient(opts);
		const rows = await client.insertRows('Users', [{ UserId: 'u1' }]);
		expect(rows).toEqual([{ ROWID: '9', UserId: 'u1' }]);

		const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.catalyst'))!;
		expect(call[0]).toBe('https://api.catalyst.zoho.com/baas/v1/project/PID/table/Users/row');
		expect(call[1].method).toBe('POST');
		expect(JSON.parse(call[1].body as string)).toEqual([{ UserId: 'u1' }]);
		const headers = call[1].headers as Record<string, string>;
		expect(headers.Authorization).toBe('Zoho-oauthtoken tok');
		expect(headers['CATALYST-ORG']).toBe('ORG');
		expect(headers.Environment).toBe('Development');
	});

	it('refreshes the token once and retries on 401', async () => {
		let catalystCalls = 0;
		const fetchMock = mockFetch(() => {
			catalystCalls++;
			return catalystCalls === 1 ? { ok: false, status: 401, text: async () => 'expired' } : ok([{ ROWID: '1' }]);
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new CatalystDataStoreClient(opts);
		const rows = await client.query('SELECT ROWID FROM Users');
		expect(rows).toEqual([{ ROWID: '1' }]);
		expect(catalystCalls).toBe(2); // 401, then retry
	});

	it('throws on a non-401 error with status + body', async () => {
		vi.stubGlobal('fetch', mockFetch(() => ({ ok: false, status: 500, text: async () => 'boom' })));
		const client = new CatalystDataStoreClient(opts);
		await expect(client.insertRows('Users', [{ UserId: 'u1' }])).rejects.toThrow(/500.*boom/);
	});

	it('getRow returns null on 404', async () => {
		vi.stubGlobal('fetch', mockFetch(() => ({ ok: false, status: 404, text: async () => 'not found' })));
		const client = new CatalystDataStoreClient(opts);
		expect(await client.getRow('Users', '123')).toBeNull();
	});

	it('query posts ZCQL to the /zcql endpoint', async () => {
		const fetchMock = mockFetch(() => ok([{ Users: { ROWID: '1' } }]));
		vi.stubGlobal('fetch', fetchMock);

		const client = new CatalystDataStoreClient(opts);
		const raw = await client.query('SELECT * FROM Users');
		expect(raw).toEqual([{ Users: { ROWID: '1' } }]);

		const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/zcql'))!;
		expect(call[0]).toBe('https://api.catalyst.zoho.com/baas/v1/project/PID/zcql');
		expect(JSON.parse(call[1].body as string)).toEqual({ query: 'SELECT * FROM Users' });
	});

	it('deleteRow tolerates a 404', async () => {
		vi.stubGlobal('fetch', mockFetch(() => ({ ok: false, status: 404, text: async () => 'gone' })));
		const client = new CatalystDataStoreClient(opts);
		await expect(client.deleteRow('Users', '123')).resolves.toBeUndefined();
	});
});
