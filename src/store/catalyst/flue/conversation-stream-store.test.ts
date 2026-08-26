import { afterEach, beforeEach, vi } from 'vitest';
import { defineConversationStreamStoreContractTests } from '@flue/runtime/test-utils/conversation-stream';
import { CatalystNoSqlClient } from '../nosql-client';
import { NOSQL_OPTS, startNoSqlHarness } from './nosql-harness';
import { CatalystAgentSubmissionStore, SUBMISSIONS_TABLE } from './agent-submission-store';
import { CONV_BATCHES_TABLE, CONV_STREAMS_TABLE, CatalystConversationStreamStore } from './conversation-stream-store';

const SCHEMA = {
	[CONV_STREAMS_TABLE]: { partitionAttr: 'Path' },
	[CONV_BATCHES_TABLE]: { partitionAttr: 'Path', sortAttr: 'Seq' },
	[SUBMISSIONS_TABLE]: { partitionAttr: 'Scope', sortAttr: 'Id' },
};

beforeEach(() => startNoSqlHarness(SCHEMA));
afterEach(() => vi.restoreAllMocks());

defineConversationStreamStoreContractTests('catalyst nosql', {
	create: () => {
		const client = new CatalystNoSqlClient(NOSQL_OPTS);
		const submissionStore = new CatalystAgentSubmissionStore(client);
		return { stream: new CatalystConversationStreamStore(client, submissionStore), submissionStore };
	},
});
