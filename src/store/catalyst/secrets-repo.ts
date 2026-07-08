import type { SecretsStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

const TABLE = 'AppSecrets';

/**
 * Fetches the deterministically-first row for `key` (lowest ROWID), so that if
 * two processes race to create the same key, every reader converges on the
 * same winning row rather than whichever insert happened to run last.
 * @param client - Data Store REST client to query with.
 * @param key - Secret key to look up.
 * @returns The matching row, or `null` if no row matches.
 * @throws {Error} If the underlying ZCQL query fails.
 */
async function getFirstByKey(client: CatalystDataStoreClient, key: string): Promise<Row | null> {
	const raw = await client.query(
		`SELECT * FROM ${TABLE} WHERE Key = ${escapeZcqlString(key)} ORDER BY ROWID LIMIT 1`,
	);
	return unwrapRows(TABLE, raw)[0] ?? null;
}

export class CatalystSecretsStore implements SecretsStore {
	/**
	 * Creates a store backed by the `AppSecrets` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Fetches a previously-created secret value by key.
	 * @param key - Secret key to look up.
	 * @returns The stored value, or `null` if `key` has never been created.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async get(key: string): Promise<string | null> {
		const row = await getFirstByKey(this.client, key);
		return row ? String(row.Value) : null;
	}

	/**
	 * Creates `key` with `value` if absent; on a concurrent-create race, returns
	 * the value of whichever row ends up with the lowest ROWID instead of `value`.
	 * @param key - Secret key to create.
	 * @param value - Value to store if `key` doesn't exist yet.
	 * @returns The winning value for `key` — either `value` or another process's.
	 * @throws {Error} If the lookup query or the insert request fails.
	 */
	async createIfAbsent(key: string, value: string): Promise<string> {
		const existing = await getFirstByKey(this.client, key);
		if (existing) return String(existing.Value);

		await this.client.insertRows(TABLE, [{ Key: key, Value: value, UpdatedAt: Date.now() }]);
		const winner = await getFirstByKey(this.client, key);
		return winner ? String(winner.Value) : value;
	}
}
