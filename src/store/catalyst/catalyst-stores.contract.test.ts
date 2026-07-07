import { vi, beforeEach, afterEach } from 'vitest';
import { evictZohoToken } from '../../auth/zoho-auth';
import { runStoresContract } from '../stores-contract';
import { createCatalystStores } from './catalyst-stores';
import type { Row } from './zcql';

/**
 * Runs the shared `Stores` contract against the real Catalyst repos + client,
 * backed by a stateful in-memory fake of the Data Store REST API (a `fetch`
 * mock). This proves column mapping, upsert-by-key, and ZCQL query shapes match
 * the interface behavior — parity with the in-memory backend.
 */

const oauth = { clientId: 'c', clientSecret: 's', refreshToken: 'catalyst-contract-refresh' };
const opts = {
	baseUrl: 'https://api.catalyst.zoho.com/baas/v1',
	projectId: 'PID',
	orgId: 'ORG',
	environment: 'Development',
	oauth,
};

// Fake Data Store: table -> (ROWID -> row).
let tables: Map<string, Map<string, Row>>;
let rowIdSeq: number;

/**
 * Resets the fake Data Store to empty and evicts the cached OAuth token, so each
 * test starts from a clean slate.
 */
function reset() {
	tables = new Map();
	rowIdSeq = 0;
	evictZohoToken(oauth);
}

/**
 * Gets (creating if necessary) the fake in-memory table for a given name.
 * @param name - Table name.
 * @returns The table's ROWID -> row map, creating an empty one if it didn't exist.
 */
function table(name: string): Map<string, Row> {
	let t = tables.get(name);
	if (!t) { t = new Map(); tables.set(name, t); }
	return t;
}

/**
 * Builds a fake successful `fetch` `Response`-like object wrapping Catalyst's `{ data }` envelope.
 * @param data - The payload to return as `data`.
 * @returns An object shaped like the subset of `Response` the client reads (`ok`, `status`, `json`).
 */
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

/**
 * Tiny ZCQL evaluator for the query shapes the repos emit (WHERE …[AND …][ORDER BY …] LIMIT n).
 * @param query - The ZCQL query string to evaluate against the in-memory fake tables.
 * @returns The rows matching the query, wrapped per-table like a real ZCQL response.
 * @throws {Error} If `query` or one of its WHERE conditions doesn't match the supported shape.
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
 * Fake implementation of the Catalyst Data Store REST surface used by the client
 * under test: routes ZCQL queries to {@link runZcql} and row POST/PUT/DELETE
 * requests to the corresponding in-memory table.
 * @param url - The requested URL (its pathname determines the operation).
 * @param init - The `fetch` request init, including method and JSON body.
 * @returns A fake `Response`-like object (see {@link json}).
 * @throws {Error} If the request doesn't match a handled ZCQL or row operation shape.
 */
function handleCatalyst(url: string, init: RequestInit) {
	const { pathname } = new URL(url);
	const body = init.body ? JSON.parse(init.body as string) : undefined;

	if (pathname.endsWith('/zcql')) return json(runZcql(body.query));

	const rowMatch = pathname.match(/\/table\/(\w+)\/row(?:\/(\d+))?$/);
	if (rowMatch) {
		const [, tableName, rowId] = rowMatch;
		const t = table(tableName);
		if (init.method === 'POST') {
			const inserted = (body as Row[]).map((r) => {
				const id = String(++rowIdSeq);
				t.set(id, { ...r });
				return { ROWID: id, ...r };
			});
			return json(inserted);
		}
		if (init.method === 'PUT') {
			const updated = (body as (Row & { ROWID: string })[]).map(({ ROWID, ...rest }) => {
				t.set(ROWID, { ...t.get(ROWID), ...rest });
				return { ROWID, ...t.get(ROWID) };
			});
			return json(updated);
		}
		if (init.method === 'DELETE' && rowId) {
			t.delete(rowId);
			return json({});
		}
	}
	throw new Error(`fake Catalyst REST cannot handle ${init.method} ${pathname}`);
}

beforeEach(() => {
	reset();
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (String(url).includes('accounts.zoho.com')) {
			return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
		}
		return handleCatalyst(String(url), init);
	}));
});
afterEach(() => vi.restoreAllMocks());

runStoresContract('catalyst (faked REST)', () => createCatalystStores(opts));
