import { afterEach, beforeEach, vi } from 'vitest';
import { defineStoreContractTests } from '@flue/runtime/test-utils';
import { CatalystNoSqlClient } from '../nosql-client';
import { NOSQL_OPTS, startNoSqlHarness } from './nosql-harness';
import { CatalystAgentSubmissionStore, SUBMISSIONS_TABLE } from './agent-submission-store';

const SCHEMA = { [SUBMISSIONS_TABLE]: { partitionAttr: 'Scope', sortAttr: 'Id' } };

beforeEach(() => startNoSqlHarness(SCHEMA));
afterEach(() => vi.restoreAllMocks());

defineStoreContractTests('catalyst nosql', {
	create: () => new CatalystAgentSubmissionStore(new CatalystNoSqlClient(NOSQL_OPTS)),
});
