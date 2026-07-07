import type { Preferences, PreferenceStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { getOneByKey, num, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Preferences';

/**
 * Maps a domain `Preferences` object to its `Preferences` table row representation.
 * @param prefs - The preferences to serialize.
 * @returns The row payload ready for `insertRows`/`updateRows`; `data` is JSON-stringified.
 */
function toRow(prefs: Preferences): Row {
	return {
		UserId: prefs.userId,
		PreferredModelKey: prefs.preferredModelKey,
		Data: JSON.stringify(prefs.data ?? {}),
		UpdatedAt: prefs.updatedAt,
	};
}

/**
 * Maps a raw `Preferences` table row to the domain `Preferences` shape.
 * @param row - The raw Data Store row.
 * @returns The parsed preferences; `data` falls back to `{}` if the stored JSON is
 * missing, corrupt, or not a plain object, rather than throwing.
 */
function fromRow(row: Row): Preferences {
	let data: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(String(row.Data ?? '{}'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
	} catch {
		// Corrupt/legacy blob — fall back to empty prefs rather than throwing.
	}
	return {
		userId: String(row.UserId),
		preferredModelKey: String(row.PreferredModelKey ?? ''),
		data,
		updatedAt: num(row.UpdatedAt),
	};
}

export class CatalystPreferenceStore implements PreferenceStore {
	/**
	 * Creates a store backed by the `Preferences` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Fetches a user's stored preferences.
	 * @param userId - User id (ZUID) to look up.
	 * @returns The preferences, or `null` if none have been stored yet.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async get(userId: string): Promise<Preferences | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	/**
	 * Inserts or replaces a user's preferences row.
	 * @param prefs - The preferences to store, keyed by `prefs.userId`.
	 * @throws {Error} If the lookup query or the insert/update request fails.
	 */
	async put(prefs: Preferences): Promise<void> {
		await upsertByKey(this.client, TABLE, 'UserId', prefs.userId, toRow(prefs));
	}
}
