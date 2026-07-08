/**
 * In-memory fake of the Catalyst Cache REST surface for tests: segment-scoped
 * `POST`/`PUT`/`GET`(`?cacheKey=`)/`DELETE`(`?cacheKey=`) at
 * `.../segment/{id}/cache`. TTL (`expiry_in_hours`) is accepted but not
 * time-simulated — tests assert stored/returned values, not expiry timing.
 */

/** Mutable fake Cache state: key -> string value. */
export interface CacheState {
	entries: Map<string, string>;
}

/**
 * Creates empty fake Cache state.
 * @returns Fresh state ready for {@link handleCache}.
 */
export function createCacheState(): CacheState {
	return { entries: new Map() };
}

/** A minimal `Response`-like object the Cache client reads. */
interface FakeResponse {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
}

/**
 * Builds a fake success response wrapping Catalyst's `{ status, data }` envelope.
 * @param data - The payload to return as `data`.
 * @returns A `Response`-like success object.
 */
function ok(data: unknown): FakeResponse {
	return { ok: true, status: 200, json: async () => ({ status: 'success', data }), text: async () => '' };
}

/**
 * Builds a fake 404 (used for a missing cache key).
 * @returns A `Response`-like 404 object.
 */
function notFound(): FakeResponse {
	return { ok: false, status: 404, json: async () => ({ status: 'failure' }), text: async () => 'not found' };
}

/**
 * Routes a Cache REST request against the fake state.
 * @param url - The requested URL.
 * @param init - The `fetch` init (method + JSON body).
 * @param state - The fake Cache state.
 * @returns A `Response`-like object, or `null` if the URL isn't a Cache path.
 * @throws {Error} If the request matches a Cache path but not a handled shape.
 */
export function handleCache(url: string, init: RequestInit, state: CacheState): FakeResponse | null {
	const u = new URL(url);
	if (!/\/segment\/[^/]+\/cache$/.test(u.pathname)) return null;
	const method = init.method ?? 'GET';

	if (method === 'POST' || method === 'PUT') {
		const body = JSON.parse(init.body as string) as { cache_name: string; cache_value: unknown };
		state.entries.set(body.cache_name, String(body.cache_value));
		return ok({ cache_name: body.cache_name, cache_value: String(body.cache_value) });
	}

	const key = u.searchParams.get('cacheKey') ?? '';
	if (method === 'GET') {
		return state.entries.has(key) ? ok({ cache_name: key, cache_value: state.entries.get(key) }) : notFound();
	}
	if (method === 'DELETE') {
		state.entries.delete(key);
		return ok({ cache_name: key, cache_value: null });
	}
	throw new Error(`fake Cache cannot handle ${method} ${u.pathname}`);
}
