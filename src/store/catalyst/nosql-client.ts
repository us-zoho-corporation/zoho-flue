import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../../auth/zoho-auth';

/**
 * Thin REST client over the Catalyst NoSQL API, authenticated with the
 * service-account admin token — the sibling of {@link CatalystDataStoreClient}
 * for document/key-value access patterns. Centralizes header injection, the
 * evict-and-retry-once-on-401 behavior, and the typed custom-JSON value
 * encoding NoSQL requires, so repositories stay declarative.
 *
 * Design notes (from the verified NoSQL REST reference):
 * - Reads go through `POST /item/query` (partition-key `equals`), never the
 *   documented `GET /item/fetch` endpoint: that one carries a request body on a
 *   GET, which Node's `fetch` refuses. Querying by partition key is the
 *   best-documented read shape; callers filter by sort key client-side.
 * - Values use Catalyst's typed custom-JSON form (`{ S }`, `{ N }`, `{ BOOL }`,
 *   `{ M }`, `{ L }`). Numbers travel as strings.
 * - Table/index creation is console-only; this client only does data ops.
 *
 * WIRE-FORMAT VALIDATION: the query/update response envelope and the
 * conditional-write/update-attribute shapes are the doc-ambiguous parts of the
 * NoSQL API. They are centralized in this file and marked `@remarks validate`;
 * confirm them against a live table (see scripts/nosql-probe) before trusting
 * production behavior.
 */

/** Catalyst typed custom-JSON value. Numbers are represented as strings. */
export type NoSqlValue =
	| { S: string }
	| { N: string }
	| { BOOL: boolean }
	| { M: Record<string, NoSqlValue> }
	| { L: NoSqlValue[] };

/** A decoded NoSQL item: attribute name -> JS value. */
export type Item = Record<string, unknown>;

/**
 * A primary-key selector. `partition` is always required; `sort` is present only
 * for composite-key tables. Values are the raw JS values (encoded internally).
 */
export interface NoSqlKey {
	partition: string | number;
	sort?: string | number;
}

/**
 * A write condition (CAS guard) in Catalyst's condition grammar. Either a single
 * attribute comparison, a boolean group, or a built-in function check.
 * @remarks validate — the on-the-wire condition shape is doc-ambiguous.
 */
export type NoSqlCondition =
	| { attribute: string[]; operator: NoSqlOperator; value: unknown }
	| { group_operator: 'and' | 'or'; group: NoSqlCondition[] }
	| { function: { function_name: 'attribute_exist' | 'attribute_not_exists' | 'attribute_type'; args: unknown[] } };

/** Comparison operators accepted by NoSQL conditions and sort-key queries. */
export type NoSqlOperator =
	| 'equals' | 'not_equals'
	| 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal'
	| 'begins_with' | 'contains' | 'not_contains'
	| 'in' | 'not_in' | 'between' | 'not_between';

export interface CatalystNoSqlOptions {
	/** e.g. https://api.catalyst.zoho.com/baas/v1 */
	baseUrl: string;
	projectId: string;
	orgId: string;
	/** Value for the `Environment` header, e.g. 'Development'. */
	environment: string;
	/** Service-account credentials — the admin token used for all NoSQL calls. */
	oauth: OAuthCredentials;
}

/**
 * Encodes a JS value into Catalyst's typed custom-JSON form.
 * @param v - The value to encode (string, number, boolean, array, or plain object).
 * @returns The typed NoSQL value.
 * @throws {Error} If `v` is null/undefined or an unsupported type.
 */
export function encodeValue(v: unknown): NoSqlValue {
	if (typeof v === 'string') return { S: v };
	if (typeof v === 'number') return { N: String(v) };
	if (typeof v === 'boolean') return { BOOL: v };
	if (Array.isArray(v)) return { L: v.map(encodeValue) };
	if (v && typeof v === 'object') {
		const m: Record<string, NoSqlValue> = {};
		for (const [k, val] of Object.entries(v)) if (val != null) m[k] = encodeValue(val);
		return { M: m };
	}
	throw new Error(`Cannot encode NoSQL value: ${String(v)}`);
}

/**
 * Decodes a typed custom-JSON value back to a plain JS value.
 * @param v - The typed NoSQL value.
 * @returns The decoded JS value; unknown shapes decode to `null`.
 */
export function decodeValue(v: NoSqlValue): unknown {
	if ('S' in v) return v.S;
	if ('N' in v) return Number(v.N);
	if ('BOOL' in v) return v.BOOL;
	if ('L' in v) return v.L.map(decodeValue);
	if ('M' in v) {
		const o: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v.M)) o[k] = decodeValue(val);
		return o;
	}
	return null;
}

/**
 * Encodes a JS item into a typed attribute map, omitting null/undefined fields
 * (absent attributes decode back to `null` at the repository boundary).
 * @param item - The item whose non-null fields should be encoded.
 * @returns The typed attribute map ready for an insert/update body.
 */
export function encodeItem(item: Item): Record<string, NoSqlValue> {
	const out: Record<string, NoSqlValue> = {};
	for (const [k, v] of Object.entries(item)) if (v != null) out[k] = encodeValue(v);
	return out;
}

/**
 * Decodes a typed attribute map back into a plain JS item.
 * @param raw - The typed attribute map from a NoSQL response.
 * @returns The decoded item.
 */
export function decodeItem(raw: Record<string, NoSqlValue>): Item {
	const out: Item = {};
	for (const [k, v] of Object.entries(raw)) out[k] = decodeValue(v);
	return out;
}

/**
 * Encodes a {@link NoSqlCondition} tree, typed-encoding every embedded value.
 * @param c - The condition to encode.
 * @returns The wire-form condition object.
 */
function encodeCondition(c: NoSqlCondition): unknown {
	if ('attribute' in c) return { attribute: c.attribute, operator: c.operator, value: encodeValue(c.value) };
	if ('group_operator' in c) return { group_operator: c.group_operator, group: c.group.map(encodeCondition) };
	return c; // function form: args are already in wire shape
}

export class CatalystNoSqlClient {
	/**
	 * Creates a client scoped to a single Catalyst project/environment.
	 * @param opts - Base URL, project/org ids, environment, and service-account OAuth credentials.
	 */
	constructor(private readonly opts: CatalystNoSqlOptions) {}

	/**
	 * Builds the absolute URL for a NoSQL table path.
	 * @param path - Path appended after the table id (e.g. `/item`, `/item/query`).
	 * @param tableId - Case-sensitive table id or name.
	 * @returns The absolute Catalyst NoSQL URL.
	 */
	private tableUrl(tableId: string, path: string): string {
		return `${this.opts.baseUrl}/project/${this.opts.projectId}/nosqltable/${tableId}${path}`;
	}

	/**
	 * Issues a request with auth/org/env headers; on 401, refreshes the token once and retries.
	 * @param method - HTTP method to send.
	 * @param url - Absolute URL to request.
	 * @param body - JSON-serializable request body.
	 * @returns The `data` field of Catalyst's `{ status, data }` envelope.
	 * @throws {Error} If the token can't be refreshed or Catalyst returns a non-2xx response.
	 */
	private async send<T>(method: string, url: string, body: unknown, context: string): Promise<T> {
		const call = async () => {
			const token = await getZohoAccessToken(this.opts.oauth);
			return fetch(url, {
				method,
				headers: {
					Authorization: `Zoho-oauthtoken ${token}`,
					'CATALYST-ORG': this.opts.orgId,
					Environment: this.opts.environment,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});
		};

		let res = await call();
		if (res.status === 401) {
			evictZohoToken(this.opts.oauth);
			res = await call();
		}
		if (!res.ok) {
			const errBody = await res.text().catch(() => res.statusText);
			throw new Error(`Catalyst NoSQL ${context} failed (${res.status}): ${errBody}`);
		}
		const json = (await res.json()) as { data?: T };
		return json.data as T;
	}

	/**
	 * Inserts a single item, optionally guarded by a condition.
	 * @param tableId - Case-sensitive table id or name.
	 * @param item - The item to insert (null fields are omitted).
	 * @param opts - Optional `condition` (CAS guard).
	 * @returns `true` if inserted; `false` if a supplied condition rejected the write.
	 * @throws {Error} If the token refresh fails or Catalyst returns an unexpected error.
	 * @remarks validate — collision behavior on a duplicate primary key is doc-unverified.
	 */
	async insertItem(tableId: string, item: Item, opts: { condition?: NoSqlCondition } = {}): Promise<boolean> {
		const body: Record<string, unknown> = { item: encodeItem(item) };
		if (opts.condition) body.condition = encodeCondition(opts.condition);
		try {
			await this.send('POST', this.tableUrl(tableId, '/item'), body, `insert into ${tableId}`);
			return true;
		} catch (err) {
			if (opts.condition && isConditionFailure(err)) return false;
			throw err;
		}
	}

	/**
	 * Queries all items in a partition (optionally against a secondary index),
	 * following pagination to completion.
	 * @param tableId - Case-sensitive table id or name.
	 * @param partitionValue - Partition-key value to match (`equals`).
	 * @param opts - Optional `indexId` to query a secondary index, and `consistentRead`.
	 * @returns Every decoded item in the partition.
	 * @throws {Error} If the token refresh fails or Catalyst returns an error.
	 * @remarks validate — the query response/pagination envelope is doc-ambiguous; parsed defensively.
	 */
	async queryPartition(
		tableId: string,
		partitionValue: string | number,
		opts: { indexId?: string; consistentRead?: boolean } = {},
	): Promise<Item[]> {
		const path = opts.indexId ? `/index/${opts.indexId}/item/query` : '/item/query';
		const items: Item[] = [];
		let startKey: unknown;
		do {
			const body: Record<string, unknown> = {
				key_condition: { partition_key: encodeValue(partitionValue) },
				consistent_read: String(opts.consistentRead ?? true),
			};
			if (startKey !== undefined) body.start_key = startKey;
			const data = await this.send<unknown>('POST', this.tableUrl(tableId, path), body, `query ${tableId}`);
			const { rows, next } = parseQueryData(data);
			items.push(...rows);
			startKey = next;
		} while (startKey !== undefined);
		return items;
	}

	/**
	 * Fetches a single item by its full primary key. For composite-key tables the
	 * sort key is matched client-side against the partition results.
	 * @param tableId - Case-sensitive table id or name.
	 * @param key - The primary-key selector.
	 * @param sortAttr - Name of the sort-key attribute (required when `key.sort` is set).
	 * @returns The matching item, or `null` if none.
	 * @throws {Error} If the token refresh fails or Catalyst returns an error.
	 */
	async getItem(tableId: string, key: NoSqlKey, sortAttr?: string): Promise<Item | null> {
		const rows = await this.queryPartition(tableId, key.partition);
		if (key.sort === undefined) return rows[0] ?? null;
		if (!sortAttr) throw new Error('getItem: sortAttr is required for composite keys');
		return rows.find((r) => String(r[sortAttr]) === String(key.sort)) ?? null;
	}

	/**
	 * Updates (PUT-merges) attributes on an existing item, optionally guarded by a condition.
	 * @param tableId - Case-sensitive table id or name.
	 * @param key - The primary key of the item to update.
	 * @param changes - Attribute values to set (null fields omitted).
	 * @param opts - Optional `condition` (CAS guard).
	 * @returns `true` if updated; `false` if a supplied condition rejected the write.
	 * @throws {Error} If the token refresh fails or Catalyst returns an unexpected error.
	 * @remarks validate — the `update_attributes` shape is doc-ambiguous.
	 */
	async updateItem(
		tableId: string,
		key: NoSqlKey,
		changes: Item,
		opts: { condition?: NoSqlCondition } = {},
	): Promise<boolean> {
		const body: Record<string, unknown> = {
			keys: encodeKeys(key),
			update_attributes: { item: encodeItem(changes) },
		};
		if (opts.condition) body.condition = encodeCondition(opts.condition);
		try {
			await this.send('PUT', this.tableUrl(tableId, '/item'), body, `update ${tableId}`);
			return true;
		} catch (err) {
			if (opts.condition && isConditionFailure(err)) return false;
			throw err;
		}
	}

	/**
	 * Deletes an item by primary key. A no-op if it doesn't exist.
	 * @param tableId - Case-sensitive table id or name.
	 * @param key - The primary key of the item to delete.
	 * @throws {Error} If the token refresh fails or Catalyst returns an error.
	 */
	async deleteItem(tableId: string, key: NoSqlKey): Promise<void> {
		await this.send('DELETE', this.tableUrl(tableId, '/item'), { keys: encodeKeys(key) }, `delete from ${tableId}`);
	}
}

/**
 * Encodes a primary-key selector into the `keys` wire shape (`partition_key` /
 * optional `sort_key`), which labels values positionally rather than by attribute name.
 * @param key - The primary-key selector.
 * @returns The wire-form keys object.
 */
function encodeKeys(key: NoSqlKey): Record<string, NoSqlValue> {
	const out: Record<string, NoSqlValue> = { partition_key: encodeValue(key.partition) };
	if (key.sort !== undefined) out.sort_key = encodeValue(key.sort);
	return out;
}

/**
 * Heuristically classifies an error as a condition (CAS) rejection vs. a real
 * failure, so guarded writes can report `false` instead of throwing.
 * @param err - The thrown error.
 * @returns `true` if the error looks like a failed-condition response.
 * @remarks validate — the exact condition-failure status/message is doc-unverified.
 */
function isConditionFailure(err: unknown): boolean {
	const msg = String((err as Error)?.message ?? err);
	return /condition|conditional|\b(409|412)\b/i.test(msg);
}

/**
 * Defensively parses a NoSQL query `data` payload into rows plus an optional
 * pagination cursor, tolerating the several envelope shapes the docs imply
 * (`fetched_data.item` singular/array, a bare array, or a `{ items }` field).
 * @param data - The `data` field of a query response.
 * @returns The decoded rows and the next `start_key` (or `undefined` when done).
 */
function parseQueryData(data: unknown): { rows: Item[]; next: unknown } {
	const container = (data as Record<string, unknown>)?.fetched_data ?? data;
	const raw =
		(container as Record<string, unknown>)?.item ??
		(container as Record<string, unknown>)?.items ??
		container;
	const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
	const rows = list.map((r) => decodeItem(r as Record<string, NoSqlValue>));
	const next = (data as Record<string, unknown>)?.start_key;
	return { rows, next };
}
