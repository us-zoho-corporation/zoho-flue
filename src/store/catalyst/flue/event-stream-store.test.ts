import { afterEach, beforeEach, vi } from 'vitest';
import { defineEventStreamStoreContractTests } from '@flue/runtime/test-utils';
import { CatalystNoSqlClient } from '../nosql-client';
import { NOSQL_OPTS, startNoSqlHarness } from './nosql-harness';
import { CatalystEventStreamStore, EVENTS_TABLE, EVENT_STREAMS_TABLE } from './event-stream-store';

const SCHEMA = {
	[EVENT_STREAMS_TABLE]: { partitionAttr: 'Path' },
	[EVENTS_TABLE]: { partitionAttr: 'Path', sortAttr: 'Seq' },
};

beforeEach(() => startNoSqlHarness(SCHEMA));
afterEach(() => vi.restoreAllMocks());

defineEventStreamStoreContractTests('catalyst nosql', {
	create: () => new CatalystEventStreamStore(new CatalystNoSqlClient(NOSQL_OPTS)),
});
