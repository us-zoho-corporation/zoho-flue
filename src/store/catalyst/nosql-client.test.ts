import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evictZohoToken } from '../../auth/zoho-auth';
import { CatalystNoSqlClient, decodeValue, encodeValue } from './nosql-client';
import { createNoSqlState, handleNoSql, type NoSqlState } from './nosql-fake';

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'nosql-client-refresh' };
const client = new CatalystNoSqlClient({
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	oauth,
});

let state: NoSqlState;

beforeEach(() => {
	state = createNoSqlState({
		Kv: { partitionAttr: 'Id' },
		Servers: { partitionAttr: 'UserId', sortAttr: 'Id' },
		Sessions: { partitionAttr: 'SessionId', indexes: { byUser: { partitionAttr: 'UserId' } } },
	});
	evictZohoToken(oauth);
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		const res = handleNoSql(String(url), init, state);
		if (!res) throw new Error(`unexpected fetch: ${url}`);
		return res;
	}));
});
afterEach(() => vi.restoreAllMocks());

describe('encode/decode', () => {
	it('round-trips scalars, arrays, and nested objects', () => {
		const v = encodeValue({ a: 'x', n: 3, b: true, list: ['p', 'q'], nested: { deep: 1 } });
		expect(decodeValue(v)).toEqual({ a: 'x', n: 3, b: true, list: ['p', 'q'], nested: { deep: 1 } });
	});
	it('represents numbers as strings on the wire', () => {
		expect(encodeValue(42)).toEqual({ N: '42' });
	});
});

describe('CatalystNoSqlClient', () => {
	it('inserts and reads back a single-key item', async () => {
		await client.insertItem('Kv', { Id: 'k1', Value: 'v1' });
		expect(await client.getItem('Kv', { partition: 'k1' })).toEqual({ Id: 'k1', Value: 'v1' });
	});

	it('returns null for a missing item', async () => {
		expect(await client.getItem('Kv', { partition: 'nope' })).toBeNull();
	});

	it('fetches a composite-key item by client-side sort filtering', async () => {
		await client.insertItem('Servers', { UserId: 'u1', Id: 'a', Name: 'A' });
		await client.insertItem('Servers', { UserId: 'u1', Id: 'b', Name: 'B' });
		expect(await client.getItem('Servers', { partition: 'u1', sort: 'b' }, 'Id')).toMatchObject({ Id: 'b', Name: 'B' });
	});

	it('queries all items in a partition', async () => {
		await client.insertItem('Servers', { UserId: 'u1', Id: 'a' });
		await client.insertItem('Servers', { UserId: 'u1', Id: 'b' });
		await client.insertItem('Servers', { UserId: 'u2', Id: 'c' });
		const rows = await client.queryPartition('Servers', 'u1');
		expect(rows.map((r) => r.Id).sort()).toEqual(['a', 'b']);
	});

	it('updates (merges) attributes', async () => {
		await client.insertItem('Kv', { Id: 'k1', Value: 'v1', Keep: 'yes' });
		await client.updateItem('Kv', { partition: 'k1' }, { Value: 'v2' });
		expect(await client.getItem('Kv', { partition: 'k1' })).toEqual({ Id: 'k1', Value: 'v2', Keep: 'yes' });
	});

	it('deletes an item', async () => {
		await client.insertItem('Kv', { Id: 'k1', Value: 'v1' });
		await client.deleteItem('Kv', { partition: 'k1' });
		expect(await client.getItem('Kv', { partition: 'k1' })).toBeNull();
	});

	it('conditional update succeeds when the guard holds and fails otherwise (CAS)', async () => {
		await client.insertItem('Kv', { Id: 'k1', Status: 'queued' });
		const won = await client.updateItem('Kv', { partition: 'k1' }, { Status: 'running' }, {
			condition: { attribute: ['Status'], operator: 'equals', value: 'queued' },
		});
		expect(won).toBe(true);
		const lost = await client.updateItem('Kv', { partition: 'k1' }, { Status: 'other' }, {
			condition: { attribute: ['Status'], operator: 'equals', value: 'queued' },
		});
		expect(lost).toBe(false);
		expect((await client.getItem('Kv', { partition: 'k1' }))?.Status).toBe('running');
	});

	it('queries a secondary index by its partition attribute', async () => {
		await client.insertItem('Sessions', { SessionId: 's1', UserId: 'u1' });
		await client.insertItem('Sessions', { SessionId: 's2', UserId: 'u1' });
		await client.insertItem('Sessions', { SessionId: 's3', UserId: 'u2' });
		const rows = await client.queryPartition('Sessions', 'u1', { indexId: 'byUser' });
		expect(rows.map((r) => r.SessionId).sort()).toEqual(['s1', 's2']);
	});
});
