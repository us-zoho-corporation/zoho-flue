import type { Preferences, PreferenceStore } from '../types';
import type { CatalystNoSqlClient, Item } from './nosql-client';
import { numOf, strOf } from './nosql-helpers';

const TABLE = 'Preferences';

/**
 * Maps a domain `Preferences` object to its `Preferences` NoSQL item (partition = `UserId`).
 * @param prefs - The preferences to serialize.
 * @returns The item payload; `data` is stored as a native nested map.
 */
function toItem(prefs: Preferences): Item {
	return {
		UserId: prefs.userId,
		PreferredModelKey: prefs.preferredModelKey,
		Data: prefs.data ?? {},
		UpdatedAt: prefs.updatedAt,
	};
}

/**
 * Maps a raw `Preferences` NoSQL item to the domain `Preferences` shape.
 * @param item - The decoded NoSQL item.
 * @returns The parsed preferences; `data` falls back to `{}` when absent or not a plain object.
 */
function fromItem(item: Item): Preferences {
	const raw = item.Data;
	const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	return {
		userId: strOf(item.UserId),
		preferredModelKey: strOf(item.PreferredModelKey),
		data,
		updatedAt: numOf(item.UpdatedAt),
	};
}

export class CatalystPreferenceStore implements PreferenceStore {
	/**
	 * Creates a store backed by the `Preferences` NoSQL table.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Fetches a user's stored preferences.
	 * @param userId - User id (ZUID) to look up.
	 * @returns The preferences, or `null` if none have been stored yet.
	 * @throws {Error} If the underlying query fails.
	 */
	async get(userId: string): Promise<Preferences | null> {
		const item = await this.client.getItem(TABLE, { partition: userId });
		return item ? fromItem(item) : null;
	}

	/**
	 * Inserts or replaces a user's preferences (put/overwrite).
	 * @param prefs - The preferences to store, keyed by `prefs.userId`.
	 * @throws {Error} If the insert request fails.
	 */
	async put(prefs: Preferences): Promise<void> {
		await this.client.insertItem(TABLE, toItem(prefs));
	}
}
