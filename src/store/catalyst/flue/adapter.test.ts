import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUE_FORMAT_VERSION } from '@flue/runtime/adapter';
import { CatalystNoSqlClient, encodeValue } from '../nosql-client';
import { createNoSqlState, handleNoSql, type NoSqlState } from '../nosql-fake';
import { createStratusState, handleStratus, type StratusState } from './stratus-fake';
import { NOSQL_OPTS } from './nosql-harness';
import { CatalystStratusClient } from './stratus-client';
import { createCatalystPersistenceAdapter, FLUE_META_TABLE } from './adapter';
import { SUBMISSIONS_TABLE } from './agent-submission-store';

const SCHEMA = {
	[FLUE_META_TABLE]: { partitionAttr: 'Key' },
	[SUBMISSIONS_TABLE]: { partitionAttr: 'Scope', sortAttr: 'Id' },
};
const STRATUS_OPTS = {
	objectBaseUrl: 'https://testbucket-development.zohostratus.com',
	apiBaseUrl: NOSQL_OPTS.baseUrl,
	projectId: NOSQL_OPTS.projectId,
	orgId: NOSQL_OPTS.orgId,
	environment: NOSQL_OPTS.environment,
	bucketName: 'testbucket',
	oauth: NOSQL_OPTS.oauth,
};

let nosql: NoSqlState;
let stratus: StratusState;

/**
 * Builds a Catalyst persistence adapter over the current fake state.
 * @returns The adapter under test.
 */
function makeAdapter() {
	const client = new CatalystNoSqlClient(NOSQL_OPTS);
	return createCatalystPersistenceAdapter({ nosql: client, stratus: new CatalystStratusClient(STRATUS_OPTS) });
}

beforeEach(() => {
	nosql = createNoSqlState(SCHEMA);
	stratus = createStratusState();
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		return handleStratus(String(url), init, stratus) ?? handleNoSql(String(url), init, nosql) ?? (() => {
			throw new Error(`unexpected fetch: ${url}`);
		})();
	}));
});
afterEach(() => vi.restoreAllMocks());

describe('CatalystPersistenceAdapter', () => {
	it('records the format version on first migrate and is idempotent', async () => {
		const adapter = makeAdapter();
		await adapter.migrate?.();
		await adapter.migrate?.();
		expect(nosql.tables.get(FLUE_META_TABLE)?.size).toBe(1);
	});

	it('rejects an unsupported stored format version', async () => {
		nosql.tables.set(FLUE_META_TABLE, new Map([
			['format', { Key: encodeValue('format'), Version: encodeValue(String(FLUE_FORMAT_VERSION + 1)) }],
		]));
		await expect(makeAdapter().migrate?.()).rejects.toThrow();
	});

	it('connect() returns all three stores that round-trip', async () => {
		const adapter = makeAdapter();
		await adapter.migrate?.();
		const stores = await adapter.connect();
		expect(stores.submissionStore).toBeDefined();
		expect(stores.conversationStreamStore).toBeDefined();
		expect(stores.attachmentStore).toBeDefined();

		const admission = await stores.submissionStore.admitDispatch({
			submissionId: 's1',
			agent: 'agent-a',
			id: 'instance-1',
			message: { kind: 'user', body: 'hi' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		});
		expect(admission).toMatchObject({ kind: 'submission', submission: { submissionId: 's1', status: 'queued' } });
	});
});
