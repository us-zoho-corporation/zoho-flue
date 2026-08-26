import {
	assertSupportedFlueFormatVersion,
	FLUE_FORMAT_VERSION,
	type PersistenceAdapter,
	type PersistenceStores,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, NoSqlCondition } from '../nosql-client';
import { CatalystAgentSubmissionStore } from './agent-submission-store';
import { CatalystAttachmentStore } from './attachment-store';
import { CatalystConversationStreamStore } from './conversation-stream-store';
import type { CatalystStratusClient } from './stratus-client';

/** NoSQL table holding the adapter's one-row format-version marker. */
export const FLUE_META_TABLE = 'FlueMeta';
const FORMAT_KEY = 'format';
const IF_ABSENT: NoSqlCondition = { function: { function_name: 'attribute_not_exists', args: [{ attribute_path: ['Key'] }] } };

/** Clients the Catalyst persistence adapter is built over. */
export interface CatalystAdapterDeps {
	nosql: CatalystNoSqlClient;
	stratus: CatalystStratusClient;
}

/**
 * Builds a Flue {@link PersistenceAdapter} backed by Catalyst NoSQL (submissions,
 * conversation streams) and Stratus (attachment bytes). `migrate()`
 * records/validates the Flue format version; `connect()` returns the three
 * stores. Default-exported from `src/db.ts` so Flue wires it into the generated
 * Node server.
 * @param deps - The NoSQL and Stratus clients to build the stores over.
 * @returns The persistence adapter.
 */
export function createCatalystPersistenceAdapter(deps: CatalystAdapterDeps): PersistenceAdapter {
	const { nosql, stratus } = deps;
	return {
		/**
		 * Records the format version on first boot, or validates it thereafter.
		 * @throws {PersistedFormatVersionError} If the stored version is unsupported.
		 */
		async migrate(): Promise<void> {
			const meta = await nosql.getItem(FLUE_META_TABLE, { partition: FORMAT_KEY });
			if (meta) {
				assertSupportedFlueFormatVersion(String(meta.Version));
				return;
			}
			await nosql.insertItem(
				FLUE_META_TABLE, { Key: FORMAT_KEY, Version: String(FLUE_FORMAT_VERSION) }, { condition: IF_ABSENT });
		},

		/**
		 * Assembles the three persistence stores over the shared clients.
		 * @returns The complete {@link PersistenceStores} bundle.
		 */
		connect(): PersistenceStores {
			const submissionStore = new CatalystAgentSubmissionStore(nosql);
			return {
				submissionStore,
				conversationStreamStore: new CatalystConversationStreamStore(nosql, submissionStore),
				attachmentStore: new CatalystAttachmentStore(nosql, stratus),
			};
		},
	};
}
