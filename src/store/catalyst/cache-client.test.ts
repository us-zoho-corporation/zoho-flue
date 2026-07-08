import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evictZohoToken } from '../../auth/zoho-auth';
import { CatalystCacheClient, msToExpiryHours } from './cache-client';
import { createCacheState, handleCache, type CacheState } from './cache-fake';

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'cache-client-refresh' };
const client = new CatalystCacheClient({
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	segmentId: 'SEG',
	oauth,
});

let state: CacheState;

beforeEach(() => {
	state = createCacheState();
	evictZohoToken(oauth);
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		const res = handleCache(String(url), init, state);
		if (!res) throw new Error(`unexpected fetch: ${url}`);
		return res;
	}));
});
afterEach(() => vi.restoreAllMocks());

describe('msToExpiryHours', () => {
	it('rounds up and clamps to [1, 48]', () => {
		expect(msToExpiryHours(2 * 60 * 60 * 1000)).toBe(2);
		expect(msToExpiryHours(90 * 60 * 1000)).toBe(2); // 1.5h rounds up
		expect(msToExpiryHours(-5000)).toBe(1); // past expiry clamps to the 1h floor
		expect(msToExpiryHours(1000 * 60 * 60 * 1000)).toBe(48); // clamps to the 48h cap
	});
});

describe('CatalystCacheClient', () => {
	it('puts and reads back a value', async () => {
		await client.put('k1', 'v1', 2);
		expect(await client.get('k1')).toBe('v1');
	});

	it('returns null for a missing key', async () => {
		expect(await client.get('nope')).toBeNull();
	});

	it('updates an existing value', async () => {
		await client.put('k1', 'v1', 2);
		await client.update('k1', 'v2', 2);
		expect(await client.get('k1')).toBe('v2');
	});

	it('deletes a key (and delete is a no-op when absent)', async () => {
		await client.put('k1', 'v1', 2);
		await client.delete('k1');
		expect(await client.get('k1')).toBeNull();
		await expect(client.delete('k1')).resolves.toBeUndefined();
	});
});
