import { afterEach, beforeEach, vi } from 'vitest';
import { defineAttachmentStoreContractTests } from '@flue/runtime/test-utils/attachment-store';
import { evictZohoToken } from '../../../auth/zoho-auth';
import { CatalystNoSqlClient } from '../nosql-client';
import { createNoSqlState, handleNoSql, type NoSqlState } from '../nosql-fake';
import { NOSQL_OPTS } from './nosql-harness';
import { ATTACHMENTS_TABLE, CatalystAttachmentStore } from './attachment-store';
import { CatalystStratusClient } from './stratus-client';
import { createStratusState, handleStratus, type StratusState } from './stratus-fake';

const SCHEMA = { [ATTACHMENTS_TABLE]: { partitionAttr: 'StreamPath', sortAttr: 'AttachmentId' } };
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

beforeEach(() => {
	nosql = createNoSqlState(SCHEMA);
	stratus = createStratusState();
	evictZohoToken(NOSQL_OPTS.oauth);
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

defineAttachmentStoreContractTests('catalyst stratus + nosql', {
	create: () => new CatalystAttachmentStore(
		new CatalystNoSqlClient(NOSQL_OPTS),
		new CatalystStratusClient(STRATUS_OPTS),
	),
});
