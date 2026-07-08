import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../../auth/zoho-auth';

/**
 * Thin REST client over the Catalyst Cache, authenticated with the
 * service-account admin token — the sibling of {@link CatalystNoSqlClient} for
 * ephemeral, string-only, TTL'd key-value data (used for sessions).
 *
 * From the verified Cache REST reference:
 * - One console-created **segment** (numeric id) scopes the keys; a default
 *   segment exists if none is made.
 * - Values are strings, max 16,000 chars; keys max 50 chars.
 * - TTL is `expiry_in_hours` (integer HOURS, in the body), max 48; omitting it
 *   defaults to the 48h cap.
 * - `POST` inserts, `PUT` updates, `GET`/`DELETE` take a `cacheKey` query param.
 *
 * WIRE-FORMAT VALIDATION: the GET response for a missing/expired key is
 * undocumented; {@link get} treats a 404 (or an absent `cache_value`) as `null`.
 * Confirm against a live segment (see scripts/nosql-probe notes).
 */
export interface CatalystCacheOptions {
	/** e.g. https://api.catalyst.zoho.com/baas/v1 */
	baseUrl: string;
	projectId: string;
	orgId: string;
	/** Value for the `Environment` header, e.g. 'Development'. */
	environment: string;
	/** Numeric Cache segment id (console-created, or the project's default segment). */
	segmentId: string;
	/** Service-account credentials — the admin token used for all Cache calls. */
	oauth: OAuthCredentials;
}

/** Cache's max TTL is 48 hours; requests are clamped to it. */
const MAX_EXPIRY_HOURS = 48;

/**
 * Converts a remaining-lifetime in ms to Cache's `expiry_in_hours` (integer,
 * rounded up, clamped to [1, 48]).
 * @param ms - Remaining lifetime in milliseconds.
 * @returns The whole-hours TTL to send as `expiry_in_hours`.
 */
export function msToExpiryHours(ms: number): number {
	const hours = Math.ceil(ms / (60 * 60 * 1000));
	return Math.min(MAX_EXPIRY_HOURS, Math.max(1, hours));
}

export class CatalystCacheClient {
	/**
	 * Creates a client scoped to a single Cache segment.
	 * @param opts - Base URL, project/org ids, environment, segment id, and OAuth creds.
	 */
	constructor(private readonly opts: CatalystCacheOptions) {}

	/**
	 * Builds the segment-scoped cache URL, optionally with a `cacheKey` query param.
	 * @param key - Optional cache key to append as `?cacheKey=`.
	 * @returns The absolute Catalyst Cache URL.
	 */
	private url(key?: string): string {
		const base = `${this.opts.baseUrl}/project/${this.opts.projectId}/segment/${this.opts.segmentId}/cache`;
		return key === undefined ? base : `${base}?cacheKey=${encodeURIComponent(key)}`;
	}

	/**
	 * Issues a request with auth/org/env headers; on 401, refreshes the token once and retries.
	 * @param method - HTTP method.
	 * @param url - Absolute URL.
	 * @param body - Optional JSON body.
	 * @returns The raw `Response`.
	 * @throws {Error} If the Zoho access token cannot be refreshed.
	 */
	private async request(method: string, url: string, body?: unknown): Promise<Response> {
		const send = async () => {
			const token = await getZohoAccessToken(this.opts.oauth);
			return fetch(url, {
				method,
				headers: {
					Authorization: `Zoho-oauthtoken ${token}`,
					'CATALYST-ORG': this.opts.orgId,
					Environment: this.opts.environment,
					...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
				},
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});
		};
		let res = await send();
		if (res.status === 401) { evictZohoToken(this.opts.oauth); res = await send(); }
		return res;
	}

	/**
	 * Throws on a non-2xx response with a descriptive message.
	 * @param res - The response to check.
	 * @param context - Short operation description for the error.
	 * @throws {Error} If `res` is not ok.
	 */
	private async assertOk(res: Response, context: string): Promise<void> {
		if (!res.ok) throw new Error(`Catalyst Cache ${context} failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
	}

	/**
	 * Inserts a new key with a TTL.
	 * @param key - Cache key (max 50 chars).
	 * @param value - String value (max 16,000 chars).
	 * @param expiryHours - TTL in whole hours (1–48).
	 * @throws {Error} If the token refresh fails or Catalyst returns a non-2xx response.
	 */
	async put(key: string, value: string, expiryHours: number): Promise<void> {
		const res = await this.request('POST', this.url(), { cache_name: key, cache_value: value, expiry_in_hours: expiryHours });
		await this.assertOk(res, `put ${key}`);
	}

	/**
	 * Updates an existing key's value and TTL.
	 * @param key - Cache key.
	 * @param value - New string value.
	 * @param expiryHours - New TTL in whole hours (1–48).
	 * @throws {Error} If the token refresh fails or Catalyst returns a non-2xx response.
	 */
	async update(key: string, value: string, expiryHours: number): Promise<void> {
		const res = await this.request('PUT', this.url(), { cache_name: key, cache_value: value, expiry_in_hours: expiryHours });
		await this.assertOk(res, `update ${key}`);
	}

	/**
	 * Fetches a key's value.
	 * @param key - Cache key to read.
	 * @returns The stored string, or `null` if the key is absent/expired.
	 * @throws {Error} If the token refresh fails or Catalyst returns a non-2xx, non-404 response.
	 */
	async get(key: string): Promise<string | null> {
		const res = await this.request('GET', this.url(key));
		if (res.status === 404) return null;
		await this.assertOk(res, `get ${key}`);
		const json = (await res.json()) as { data?: { cache_value?: string | null } };
		return json.data?.cache_value ?? null;
	}

	/**
	 * Deletes a key. A no-op if it doesn't exist.
	 * @param key - Cache key to delete.
	 * @throws {Error} If the token refresh fails or Catalyst returns a non-2xx, non-404 response.
	 */
	async delete(key: string): Promise<void> {
		const res = await this.request('DELETE', this.url(key));
		if (res.status === 404) return;
		await this.assertOk(res, `delete ${key}`);
	}
}
