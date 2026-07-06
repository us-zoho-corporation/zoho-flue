import type { Stores } from '../types';
import { CatalystDataStoreClient, type CatalystClientOptions } from './data-store-client';
import { CatalystPreferenceStore } from './preference-repo';
import { CatalystSessionStore } from './session-repo';
import { CatalystTokenStore } from './token-repo';
import { CatalystUserStore } from './user-repo';

/** Assembles the Catalyst Data Store repositories over one shared REST client. */
export function createCatalystStores(opts: CatalystClientOptions): Stores {
	const client = new CatalystDataStoreClient(opts);
	return {
		users: new CatalystUserStore(client),
		tokens: new CatalystTokenStore(client),
		sessions: new CatalystSessionStore(client),
		preferences: new CatalystPreferenceStore(client),
	};
}
