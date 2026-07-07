import type { Stores } from '../types';
import { CatalystDataStoreClient, type CatalystClientOptions } from './data-store-client';
import { CatalystMcpServerStore } from './mcp-server-repo';
import { CatalystPreferenceStore } from './preference-repo';
import { CatalystSessionStore } from './session-repo';
import { CatalystTokenStore } from './token-repo';
import { CatalystUserStore } from './user-repo';

/**
 * Assembles the Catalyst Data Store repositories over one shared REST client.
 * @param opts - Connection settings (base URL, project/org ids, environment) and
 * the service-account OAuth credentials shared by every repository's REST calls.
 * @returns A `Stores` instance backed by Catalyst Data Store tables.
 */
export function createCatalystStores(opts: CatalystClientOptions): Stores {
	const client = new CatalystDataStoreClient(opts);
	return {
		users: new CatalystUserStore(client),
		tokens: new CatalystTokenStore(client),
		sessions: new CatalystSessionStore(client),
		preferences: new CatalystPreferenceStore(client),
		mcpServers: new CatalystMcpServerStore(client),
	};
}
