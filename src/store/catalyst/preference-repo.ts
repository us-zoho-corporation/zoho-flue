import type { Preferences, PreferenceStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { getOneByKey, num, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Preferences';

function toRow(prefs: Preferences): Row {
	return {
		UserId: prefs.userId,
		PreferredModelKey: prefs.preferredModelKey,
		Data: JSON.stringify(prefs.data ?? {}),
		UpdatedAt: prefs.updatedAt,
	};
}

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
	constructor(private readonly client: CatalystDataStoreClient) {}

	async get(userId: string): Promise<Preferences | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	async put(prefs: Preferences): Promise<void> {
		await upsertByKey(this.client, TABLE, 'UserId', prefs.userId, toRow(prefs));
	}
}
