import type { User, UserStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, getOneByKey, num, textOrNull, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Users';

/**
 * Maps a domain `User` to its `Users` table row representation.
 * @param user - The user record to serialize.
 * @returns The row payload ready for `insertRows`/`updateRows`.
 */
function toRow(user: User): Row {
	return {
		UserId: user.userId,
		Email: user.email,
		DisplayName: user.displayName,
		FirstName: user.firstName,
		LastName: user.lastName,
		PhotoId: user.photoId,
		CreatedAt: user.createdAt,
		LastLoginAt: user.lastLoginAt,
	};
}

/**
 * Maps a raw `Users` table row to the domain `User` shape.
 * @param row - The raw Data Store row.
 * @returns The parsed user record.
 */
function fromRow(row: Row): User {
	return {
		userId: String(row.UserId),
		email: String(row.Email ?? ''),
		displayName: String(row.DisplayName ?? ''),
		firstName: String(row.FirstName ?? ''),
		lastName: String(row.LastName ?? ''),
		photoId: textOrNull(row.PhotoId),
		createdAt: num(row.CreatedAt),
		lastLoginAt: num(row.LastLoginAt),
	};
}

export class CatalystUserStore implements UserStore {
	/**
	 * Creates a store backed by the `Users` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Inserts or replaces a user row keyed by `user.userId`.
	 * @param user - The user record to store.
	 * @returns The same `user` record passed in.
	 * @throws {Error} If the lookup query or the insert/update request fails.
	 */
	async upsert(user: User): Promise<User> {
		await upsertByKey(this.client, TABLE, 'UserId', user.userId, toRow(user));
		return user;
	}

	/**
	 * Fetches a user by their Zoho user id (ZUID).
	 * @param userId - User id (ZUID) to look up.
	 * @returns The user record, or `null` if none exists.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async getById(userId: string): Promise<User | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	/**
	 * Updates a user's last-login timestamp. A no-op if the user doesn't exist.
	 * @param userId - User id (ZUID) to update.
	 * @param at - New last-login timestamp (epoch ms).
	 * @throws {Error} If the lookup query or the update request fails.
	 */
	async touchLogin(userId: string, at: number): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'UserId', userId);
		if (rowId) await this.client.updateRows(TABLE, [{ ROWID: rowId, LastLoginAt: at }]);
	}
}
