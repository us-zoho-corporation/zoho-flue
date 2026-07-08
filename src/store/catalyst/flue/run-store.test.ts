import { afterEach, beforeEach, vi } from 'vitest';
import { defineRunStoreContractTests } from '@flue/runtime/test-utils';
import { CatalystNoSqlClient } from '../nosql-client';
import { NOSQL_OPTS, startNoSqlHarness } from './nosql-harness';
import { CatalystRunStore, RUNS_TABLE } from './run-store';

const SCHEMA = { [RUNS_TABLE]: { partitionAttr: 'Scope', sortAttr: 'RunId' } };

beforeEach(() => startNoSqlHarness(SCHEMA));
afterEach(() => vi.restoreAllMocks());

defineRunStoreContractTests('catalyst nosql', {
	create: () => new CatalystRunStore(new CatalystNoSqlClient(NOSQL_OPTS)),
});
