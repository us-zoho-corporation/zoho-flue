import { config } from '../config';
import { createCatalystStores } from './catalyst/catalyst-stores';
import { createMemoryStores } from './memory/memory-stores';
import type { Stores } from './types';

export type { Stores } from './types';

/**
 * Returns the app's `Stores`, selecting the backend by `config.storeBackend`.
 * Memoized on `globalThis` so HMR module re-evaluation reuses one instance
 * (mirrors the token-cache anchoring in `src/auth/zoho-auth.ts`).
 * @returns The shared `Stores` instance for this process — in-memory when
 * `config.storeBackend === 'memory'`, otherwise Catalyst Data Store-backed.
 */
export function getStores(): Stores {
	const existing = (globalThis as Record<string, unknown>).__flueStores as Stores | undefined;
	if (existing) return existing;

	const stores = config.storeBackend === 'memory'
		? createMemoryStores()
		: createCatalystStores({
				baseUrl: config.catalystApiBaseUrl,
				projectId: config.catalystProjectId,
				orgId: config.catalystOrgId,
				environment: config.catalystEnvironment,
				cacheSegmentId: config.catalystCacheSegment,
				oauth: {
					clientId: config.zohoClientId,
					clientSecret: config.zohoClientSecret,
					refreshToken: config.zohoRefreshToken,
				},
			});

	(globalThis as Record<string, unknown>).__flueStores = stores;
	return stores;
}
