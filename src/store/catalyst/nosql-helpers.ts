import type { Item } from './nosql-client';

/**
 * Shared coercion helpers for NoSQL repositories. `decodeItem` already returns
 * native JS types (numbers as numbers, booleans as booleans), so these are
 * defensive normalizers for absent/legacy attributes rather than parsers.
 */

/**
 * Coerces a decoded NoSQL cell to a number.
 * @param v - The decoded value, or `undefined` if the attribute was absent.
 * @returns The numeric value, or `0` when nullish.
 */
export function numOf(v: Item[string] | undefined): number {
	return typeof v === 'number' ? v : Number(v ?? 0);
}

/**
 * Coerces a decoded NoSQL cell to a string.
 * @param v - The decoded value, or `undefined` if the attribute was absent.
 * @returns The string value, or `''` when nullish.
 */
export function strOf(v: Item[string] | undefined): string {
	return v == null ? '' : String(v);
}

/**
 * Coerces a decoded NoSQL cell to `string | null` (absent/empty -> null).
 * @param v - The decoded value, or `undefined` if the attribute was absent.
 * @returns The string value, or `null` when nullish or empty.
 */
export function strOrNull(v: Item[string] | undefined): string | null {
	return v == null || v === '' ? null : String(v);
}

/**
 * Coerces a decoded NoSQL cell to a boolean.
 * @param v - The decoded value, or `undefined` if the attribute was absent.
 * @returns `true` for a truthy boolean/1/'true', else `false`.
 */
export function boolOf(v: Item[string] | undefined): boolean {
	return v === true || v === 1 || v === 'true' || v === '1';
}
