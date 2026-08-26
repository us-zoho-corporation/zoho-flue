import type { OAuthCredentials } from '../../auth/zoho-auth';
import type { Stores } from '../types';
import { CatalystCacheClient } from './cache-client';
import { CatalystDataStoreClient } from './data-store-client';
import { CatalystNoSqlClient } from './nosql-client';
import { CatalystConversationOwnerStore } from './conversation-owner-repo';
import { CatalystDocsTokenStore } from './docs-token-repo';
import { CatalystMcpServerStore } from './mcp-server-repo';
import { CatalystPreferenceStore } from './preference-repo';
import { CatalystSecretsStore } from './secrets-repo';
import { CatalystSessionStore } from './session-repo';
import { CatalystTokenStore } from './token-repo';
import { CatalystUserStore } from './user-repo';

/** Connection settings shared by the NoSQL and Data Store REST clients. */
export interface CatalystStoresOptions {
	/** e.g. https://api.catalyst.zoho.com/baas/v1 */
	baseUrl: string;
	projectId: string;
	orgId: string;
	/** Value for the `Environment` header, e.g. 'Development'. */
	environment: string;
	/** Service-account credentials — the admin token shared by every REST call. */
	oauth: OAuthCredentials;
	/** Numeric Cache segment id backing the session store. */
	cacheSegmentId: string;
}

/**
 * Assembles the Catalyst-backed repositories, choosing the right service per
 * access pattern: `users`, `tokens`, `preferences`, and `mcpServers` (durable
 * key-value / partition access) run on **NoSQL**; `sessions` (short-lived,
 * per-request, auto-expiring) run on **Cache**; and `secrets` and
 * `conversationOwners` stay on **Data Store**, whose read-ordered
 * `createIfAbsent`/`claimOrGetOwner` gives proven atomic first-writer-wins.
 * All clients share one service-account token.
 * @param opts - Connection settings and the service-account OAuth credentials.
 * @returns A `Stores` instance backed by Catalyst NoSQL + Cache + Data Store.
 */
export function createCatalystStores(opts: CatalystStoresOptions): Stores {
	const nosql = new CatalystNoSqlClient(opts);
	const datastore = new CatalystDataStoreClient(opts);
	const cache = new CatalystCacheClient({ ...opts, segmentId: opts.cacheSegmentId });
	return {
		users: new CatalystUserStore(nosql),
		tokens: new CatalystTokenStore(nosql),
		docsTokens: new CatalystDocsTokenStore(nosql),
		sessions: new CatalystSessionStore(cache),
		preferences: new CatalystPreferenceStore(nosql),
		mcpServers: new CatalystMcpServerStore(nosql),
		secrets: new CatalystSecretsStore(datastore),
		conversationOwners: new CatalystConversationOwnerStore(datastore),
	};
}
