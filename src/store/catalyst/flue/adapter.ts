import {
	assertSupportedFlueSchemaVersion,
	FLUE_SCHEMA_VERSION,
	type PersistenceAdapter,
	type PersistenceStores,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, NoSqlCondition } from '../nosql-client';
import { CatalystAgentExecutionStore } from './agent-submission-store';
import { CatalystAttachmentStore } from './attachment-store';
import { CatalystConversationStreamStore } from './conversation-stream-store';
import { CatalystEventStreamStore } from './event-stream-store';
import { CatalystRunStore } from './run-store';
import type { CatalystStratusClient } from './stratus-client';

/** NoSQL table holding the adapter's one-row schema-version marker. */
export const FLUE_META_TABLE = 'FlueMeta';
const SCHEMA_KEY = 'schema';
const IF_ABSENT: NoSqlCondition = { function: { function_name: 'attribute_not_exists', args: [{ attribute_path: ['Key'] }] } };

/** Clients the Catalyst persistence adapter is built over. */
export interface CatalystAdapterDeps {
	nosql: CatalystNoSqlClient;
	stratus: CatalystStratusClient;
}

/**
 * Builds a Flue {@link PersistenceAdapter} backed by Catalyst NoSQL (runs,
 * event/conversation streams, submissions) and Stratus (attachment bytes).
 * `migrate()` records/validates the Flue schema version; `connect()` returns the
 * five stores. Default-exported from `src/db.ts` so Flue wires it into the
 * generated Node server.
 * @param deps - The NoSQL and Stratus clients to build the stores over.
 * @returns The persistence adapter.
 */
export function createCatalystPersistenceAdapter(deps: CatalystAdapterDeps): PersistenceAdapter {
	const { nosql, stratus } = deps;
	return {
		/**
		 * Records the schema version on first boot, or validates it thereafter.
		 * @throws {PersistedSchemaVersionError} If the stored version is unsupported.
		 */
		async migrate(): Promise<void> {
			const meta = await nosql.getItem(FLUE_META_TABLE, { partition: SCHEMA_KEY });
			if (meta) {
				assertSupportedFlueSchemaVersion(String(meta.Version));
				return;
			}
			await nosql.insertItem(
				FLUE_META_TABLE, { Key: SCHEMA_KEY, Version: String(FLUE_SCHEMA_VERSION) }, { condition: IF_ABSENT });
		},

		/**
		 * Assembles the five persistence stores over the shared clients.
		 * @returns The complete {@link PersistenceStores} bundle.
		 */
		connect(): PersistenceStores {
			const executionStore = new CatalystAgentExecutionStore(nosql);
			return {
				executionStore,
				runStore: new CatalystRunStore(nosql),
				eventStreamStore: new CatalystEventStreamStore(nosql),
				conversationStreamStore: new CatalystConversationStreamStore(nosql, executionStore.submissions),
				attachmentStore: new CatalystAttachmentStore(nosql, stratus),
			};
		},
	};
}
