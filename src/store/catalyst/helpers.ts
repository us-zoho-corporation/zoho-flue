import type { CatalystDataStoreClient } from './data-store-client';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

/**
 * Shared single-row-per-key helpers for the Data Store repos. Table and column
 * names are compile-time constants (safe to interpolate); the key *value* is
 * always escaped via {@link escapeZcqlString}.
 */

/**
 * Looks up the ROWID of the single row where `keyCol = keyVal`.
 * @param client - Data Store REST client to query with.
 * @param table - Case-sensitive table name.
 * @param keyCol - Case-sensitive column name to match on.
 * @param keyVal - Key value to match (escaped before interpolation).
 * @returns The matching row's ROWID, or `null` if no row matches.
 * @throws {Error} If the underlying ZCQL query fails.
 */
export async function findRowIdByKey(
	client: CatalystDataStoreClient,
	table: string,
	keyCol: string,
	keyVal: string,
): Promise<string | null> {
	const raw = await client.query(
		`SELECT ROWID FROM ${table} WHERE ${keyCol} = ${escapeZcqlString(keyVal)} LIMIT 1`,
	);
	const id = unwrapRows(table, raw)[0]?.ROWID;
	return id != null ? String(id) : null;
}

/**
 * Fetches the single full row where `keyCol = keyVal`.
 * @param client - Data Store REST client to query with.
 * @param table - Case-sensitive table name.
 * @param keyCol - Case-sensitive column name to match on.
 * @param keyVal - Key value to match (escaped before interpolation).
 * @returns The matching row, or `null` if no row matches.
 * @throws {Error} If the underlying ZCQL query fails.
 */
export async function getOneByKey(
	client: CatalystDataStoreClient,
	table: string,
	keyCol: string,
	keyVal: string,
): Promise<Row | null> {
	const raw = await client.query(
		`SELECT * FROM ${table} WHERE ${keyCol} = ${escapeZcqlString(keyVal)} LIMIT 1`,
	);
	return unwrapRows(table, raw)[0] ?? null;
}

/**
 * Looks up the ROWIDs of every row where `keyCol = keyVal` (up to 300).
 * @param client - Data Store REST client to query with.
 * @param table - Case-sensitive table name.
 * @param keyCol - Case-sensitive column name to match on.
 * @param keyVal - Key value to match (escaped before interpolation).
 * @returns The matching rows' ROWIDs, in query order.
 * @throws {Error} If the underlying ZCQL query fails.
 */
export async function findRowIdsByKey(
	client: CatalystDataStoreClient,
	table: string,
	keyCol: string,
	keyVal: string,
): Promise<string[]> {
	const raw = await client.query(
		`SELECT ROWID FROM ${table} WHERE ${keyCol} = ${escapeZcqlString(keyVal)} LIMIT 300`,
	);
	return unwrapRows(table, raw)
		.map((r) => r.ROWID)
		.filter((v): v is string | number => v != null)
		.map(String);
}

/**
 * Insert if absent, else update the existing row identified by `keyCol = keyVal`.
 * @param client - Data Store REST client to write through.
 * @param table - Case-sensitive table name.
 * @param keyCol - Case-sensitive column name to match on.
 * @param keyVal - Key value identifying the row to upsert (escaped before interpolation).
 * @param row - Column values to insert or update.
 * @throws {Error} If the lookup query or the insert/update request fails.
 */
export async function upsertByKey(
	client: CatalystDataStoreClient,
	table: string,
	keyCol: string,
	keyVal: string,
	row: Row,
): Promise<void> {
	const rowId = await findRowIdByKey(client, table, keyCol, keyVal);
	if (rowId) await client.updateRows(table, [{ ...row, ROWID: rowId }]);
	else await client.insertRows(table, [row]);
}

/**
 * Coerces a Data Store cell (numbers may arrive as strings) to a number.
 * @param v - The raw cell value, or `undefined` if the column was absent.
 * @returns The numeric value, or `0` if `v` is `undefined`/nullish.
 */
export function num(v: Row[string] | undefined): number {
	return typeof v === 'number' ? v : Number(v ?? 0);
}

/**
 * Coerces a nullable text cell to string | null.
 * @param v - The raw cell value, or `undefined` if the column was absent.
 * @returns The string value, or `null` if `v` is nullish or an empty string.
 */
export function textOrNull(v: Row[string] | undefined): string | null {
	return v == null || v === '' ? null : String(v);
}
