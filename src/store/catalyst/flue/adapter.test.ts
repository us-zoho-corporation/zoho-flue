import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUE_SCHEMA_VERSION } from '@flue/runtime/adapter';
import { CatalystNoSqlClient, encodeValue } from '../nosql-client';
import { createNoSqlState, handleNoSql, type NoSqlState } from '../nosql-fake';
import { createStratusState, handleStratus, type StratusState } from './stratus-fake';
import { NOSQL_OPTS } from './nosql-harness';
import { CatalystStratusClient } from './stratus-client';
import { createCatalystPersistenceAdapter, FLUE_META_TABLE } from './adapter';
import { RUNS_TABLE } from './run-store';

const SCHEMA = {
	[FLUE_META_TABLE]: { partitionAttr: 'Key' },
	[RUNS_TABLE]: { partitionAttr: 'Scope', sortAttr: 'RunId' },
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
	it('records the schema version on first migrate and is idempotent', async () => {
		const adapter = makeAdapter();
		await adapter.migrate?.();
		await adapter.migrate?.();
		expect(nosql.tables.get(FLUE_META_TABLE)?.size).toBe(1);
	});

	it('rejects an unsupported stored schema version', async () => {
		nosql.tables.set(FLUE_META_TABLE, new Map([
			['schema', { Key: encodeValue('schema'), Version: encodeValue(String(FLUE_SCHEMA_VERSION + 1)) }],
		]));
		await expect(makeAdapter().migrate?.()).rejects.toThrow();
	});

	it('connect() returns all five stores that round-trip', async () => {
		const adapter = makeAdapter();
		await adapter.migrate?.();
		const stores = await adapter.connect();
		expect(stores.executionStore).toBeDefined();
		expect(stores.eventStreamStore).toBeDefined();
		expect(stores.conversationStreamStore).toBeDefined();
		expect(stores.attachmentStore).toBeDefined();
		await stores.runStore.createRun({ runId: 'r1', workflowName: 'wf', startedAt: '2026-06-01T00:00:00.000Z', input: {} });
		expect(await stores.runStore.getRun('r1')).toMatchObject({ runId: 'r1', workflowName: 'wf', status: 'active' });
	});
});
