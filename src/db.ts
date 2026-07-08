import { sqlite } from '@flue/runtime/node';
import { config } from './config';
import { CatalystNoSqlClient } from './store/catalyst/nosql-client';
import { createCatalystPersistenceAdapter } from './store/catalyst/flue/adapter';
import { CatalystStratusClient } from './store/catalyst/flue/stratus-client';

/**
 * Flue's canonical conversation/run/event/submission/attachment state. Flue
 * discovers this file at build time and wires the default-exported
 * `PersistenceAdapter` into the generated Node server.
 *
 * In production (`STORE_BACKEND=catalyst`) this is the Catalyst-backed adapter
 * (NoSQL + Stratus), so agent conversations and workflow runs survive AppSail
 * restarts/redeploys. For local/CI (`memory`) it falls back to Flue's built-in
 * in-memory SQLite — no Catalyst round-trips at boot — matching the prior
 * no-`db.ts` behavior.
 *
 * @returns The persistence adapter for the active backend.
 */
function selectAdapter() {
	if (config.storeBackend !== 'catalyst') return sqlite();

	const oauth = {
		clientId: config.zohoClientId,
		clientSecret: config.zohoClientSecret,
		refreshToken: config.zohoRefreshToken,
	};
	const nosql = new CatalystNoSqlClient({
		baseUrl: config.catalystApiBaseUrl,
		projectId: config.catalystProjectId,
		orgId: config.catalystOrgId,
		environment: config.catalystEnvironment,
		oauth,
	});
	const stratus = new CatalystStratusClient({
		objectBaseUrl: config.catalystStratusObjectBaseUrl,
		apiBaseUrl: config.catalystApiBaseUrl,
		projectId: config.catalystProjectId,
		orgId: config.catalystOrgId,
		environment: config.catalystEnvironment,
		bucketName: config.catalystStratusBucket,
		oauth,
	});
	return createCatalystPersistenceAdapter({ nosql, stratus });
}

export default selectAdapter();
