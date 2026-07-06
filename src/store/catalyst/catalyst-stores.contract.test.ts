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

function reset() {
	tables = new Map();
	rowIdSeq = 0;
	evictZohoToken(oauth);
}

function table(name: string): Map<string, Row> {
	let t = tables.get(name);
	if (!t) { t = new Map(); tables.set(name, t); }
	return t;
}

const json = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

/** Tiny ZCQL evaluator for the exact query shapes the repos emit. */
function runZcql(query: string): unknown[] {
	const m = query.match(/^SELECT (ROWID|\*) FROM (\w+) WHERE (\w+) = '(.*)' LIMIT (\d+)$/s);
	if (!m) throw new Error(`fake ZCQL cannot parse: ${query}`);
	const [, projection, tableName, col, rawVal, limit] = m;
	const val = rawVal.replace(/''/g, "'");
	const out: unknown[] = [];
	for (const [rowId, row] of table(tableName)) {
		if (String(row[col]) === val) {
			const projected = projection === 'ROWID' ? { ROWID: rowId } : { ROWID: rowId, ...row };
			out.push({ [tableName]: projected });
			if (out.length >= Number(limit)) break;
		}
	}
	return out;
}

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
