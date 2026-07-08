import { vi, beforeEach, afterEach } from 'vitest';
import { evictZohoToken } from '../../auth/zoho-auth';
import { runStoresContract } from '../stores-contract';
import { createCatalystStores } from './catalyst-stores';
import { createNoSqlState, handleNoSql, type NoSqlState } from './nosql-fake';
import { createCacheState, handleCache, type CacheState } from './cache-fake';
import type { Row } from './zcql';

/**
 * Runs the shared `Stores` contract against the real Catalyst repos + clients,
 * backed by stateful in-memory fakes of the three REST surfaces the backend
 * uses: NoSQL (users/tokens/preferences/mcpServers), Cache (sessions), and Data
 * Store (secrets). This proves attribute mapping, key/index access, and query
 * shapes match the interface behavior — parity with the in-memory backend.
 */

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'catalyst-contract-refresh' };
const opts = {
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	cacheSegmentId: 'SEG',
	oauth,
};

// The console-provisioned NoSQL schema the repos assume.
const nosqlSchema = {
	Users: { partitionAttr: 'UserId' },
	UserTokens: { partitionAttr: 'UserId' },
	Preferences: { partitionAttr: 'UserId' },
	McpServers: { partitionAttr: 'UserId', sortAttr: 'Id' },
};

let nosql: NoSqlState;
let cache: CacheState;
// Fake Data Store (secrets only): table -> (ROWID -> row).
let tables: Map<string, Map<string, Row>>;
let rowIdSeq: number;

/**
 * Resets both fake backends to empty and evicts the cached OAuth token, so each
 * test starts from a clean slate.
 */
function reset() {
	nosql = createNoSqlState(nosqlSchema);
	cache = createCacheState();
	tables = new Map();
	rowIdSeq = 0;
	evictZohoToken(oauth);
}

/**
 * Gets (creating if necessary) the fake Data Store table for a given name.
 * @param name - Table name.
 * @returns The table's ROWID -> row map.
 */
function table(name: string): Map<string, Row> {
	let t = tables.get(name);
	if (!t) { t = new Map(); tables.set(name, t); }
	return t;
}

/**
 * Builds a fake successful `fetch` `Response`-like object wrapping Catalyst's `{ data }` envelope.
 * @param data - The payload to return as `data`.
 * @returns An object shaped like the subset of `Response` the clients read.
 */
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });

/**
 * Tiny ZCQL evaluator for the secrets repo's query shape (WHERE …[ORDER BY …] LIMIT n).
 * @param query - The ZCQL query string.
 * @returns The matching rows, wrapped per-table like a real ZCQL response.
 * @throws {Error} If `query` doesn't match the supported shape.
 */
function runZcql(query: string): unknown[] {
	const m = query.match(/^SELECT (ROWID|\*) FROM (\w+) WHERE (.+?)(?: ORDER BY (\w+))? LIMIT (\d+)$/s);
	if (!m) throw new Error(`fake ZCQL cannot parse: ${query}`);
	const [, projection, tableName, whereClause, orderBy, limit] = m;
	const conds = whereClause.split(/\s+AND\s+/).map((c) => {
		const cm = c.match(/^(\w+) = '(.*)'$/s);
		if (!cm) throw new Error(`fake ZCQL cannot parse condition: ${c}`);
		return { col: cm[1], val: cm[2].replace(/''/g, "'") };
	});
	let rows = [...table(tableName)].map(([rowId, row]) => ({ rowId, row }));
	rows = rows.filter(({ row }) => conds.every((c) => String(row[c.col]) === c.val));
	if (orderBy) rows.sort((a, b) => Number(a.row[orderBy] ?? 0) - Number(b.row[orderBy] ?? 0));
	return rows.slice(0, Number(limit)).map(({ rowId, row }) =>
		({ [tableName]: projection === 'ROWID' ? { ROWID: rowId } : { ROWID: rowId, ...row } }));
}

/**
 * Fake Catalyst Data Store REST surface (secrets only): ZCQL queries and row inserts.
 * @param url - The requested URL.
 * @param init - The `fetch` init (method + JSON body).
 * @returns A fake `Response`-like object.
 * @throws {Error} If the request doesn't match a handled shape.
 */
function handleDataStore(url: string, init: RequestInit) {
	const { pathname } = new URL(url);
	const body = init.body ? JSON.parse(init.body as string) : undefined;
	if (pathname.endsWith('/zcql')) return json(runZcql(body.query));
	const rowMatch = pathname.match(/\/table\/(\w+)\/row(?:\/(\d+))?$/);
	if (rowMatch && init.method === 'POST') {
		const [, tableName] = rowMatch;
		const t = table(tableName);
		const inserted = (body as Row[]).map((r) => {
			const id = String(++rowIdSeq);
			t.set(id, { ...r });
			return { ROWID: id, ...r };
		});
		return json(inserted);
	}
	throw new Error(`fake Data Store cannot handle ${init.method} ${pathname}`);
}

beforeEach(() => {
	reset();
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		const cacheRes = handleCache(String(url), init, cache);
		if (cacheRes) return cacheRes;
		const nosqlRes = handleNoSql(String(url), init, nosql);
		if (nosqlRes) return nosqlRes;
		return handleDataStore(String(url), init);
	}));
});
afterEach(() => vi.restoreAllMocks());

runStoresContract('catalyst (faked NoSQL + Data Store REST)', () => createCatalystStores(opts));
