import { vi } from 'vitest';
import { evictZohoToken } from '../../../auth/zoho-auth';
import { CatalystNoSqlClient } from '../nosql-client';
import { createNoSqlState, handleNoSql, type NoSqlSchema, type NoSqlState } from '../nosql-fake';

/**
 * Shared test harness for the Flue persistence stores. Each store's contract
 * suite (from `@flue/runtime/test-utils`) runs against a real
 * {@link CatalystNoSqlClient} backed by the in-memory {@link handleNoSql} fake,
 * proving the store logic against this repo's interpretation of the NoSQL wire
 * format. Live-format correctness still needs the scripts/nosql-probe checks.
 */

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'flue-nosql-harness' };

/** Connection options every Flue-store test shares. */
export const NOSQL_OPTS = {
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	oauth,
};

/**
 * Creates a client + fresh fake state for the given schema and stubs `fetch` to
 * route NoSQL calls at that state. Call from a `beforeEach`.
 * @param schema - The NoSQL table/index configuration the store under test needs.
 * @returns The bound client and the mutable fake state (for assertions/resets).
 */
export function startNoSqlHarness(schema: NoSqlSchema): { client: CatalystNoSqlClient; state: NoSqlState } {
	const state = createNoSqlState(schema);
	evictZohoToken(oauth);
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		const res = handleNoSql(String(url), init, state);
		if (!res) throw new Error(`unexpected fetch: ${url}`);
		return res;
	}));
	return { client: new CatalystNoSqlClient(NOSQL_OPTS), state };
}
