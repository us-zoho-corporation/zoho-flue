/**
 * ZCQL helpers. ZCQL looks like SQL but: table/column names are case-sensitive,
 * string literals use single quotes only (escape by doubling `'`), and query
 * results arrive wrapped per table (`[{ TableName: { ROWID, ... } }]`).
 */

/** Quotes and escapes a string literal for safe interpolation into ZCQL. */
export function escapeZcqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Guards a value that must be a numeric id before interpolation (defense in depth). */
export function assertNumericId(value: string): string {
	if (!/^\d+$/.test(value)) throw new Error(`Expected numeric id, got: ${value}`);
	return value;
}

/** A single Catalyst Data Store row: column name -> value (plus ROWID / CREATEDTIME etc.). */
export type Row = Record<string, string | number | boolean | null>;

/**
 * Unwraps a ZCQL response, which nests each row's columns under the table name
 * key. Rows lacking the key are skipped. `table` is case-sensitive.
 */
export function unwrapRows(table: string, raw: unknown): Row[] {
	if (!Array.isArray(raw)) return [];
	const out: Row[] = [];
	for (const entry of raw) {
		if (entry && typeof entry === 'object' && table in entry) {
			out.push((entry as Record<string, Row>)[table]);
		}
	}
	return out;
}
