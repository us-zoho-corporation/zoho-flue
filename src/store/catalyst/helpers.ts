import type { CatalystDataStoreClient } from './data-store-client';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

/**
 * Shared single-row-per-key helpers for the Data Store repos. Table and column
 * names are compile-time constants (safe to interpolate); the key *value* is
 * always escaped via {@link escapeZcqlString}.
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

/** Insert if absent, else update the existing row identified by `keyCol = keyVal`. */
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

/** Coerces a Data Store cell (numbers may arrive as strings) to a number. */
export function num(v: Row[string] | undefined): number {
	return typeof v === 'number' ? v : Number(v ?? 0);
}

/** Coerces a nullable text cell to string | null. */
export function textOrNull(v: Row[string] | undefined): string | null {
	return v == null || v === '' ? null : String(v);
}
