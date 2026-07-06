import type { User, UserStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, getOneByKey, num, textOrNull, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Users';

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
	constructor(private readonly client: CatalystDataStoreClient) {}

	async upsert(user: User): Promise<User> {
		await upsertByKey(this.client, TABLE, 'UserId', user.userId, toRow(user));
		return user;
	}

	async getById(userId: string): Promise<User | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	async touchLogin(userId: string, at: number): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'UserId', userId);
		if (rowId) await this.client.updateRows(TABLE, [{ ROWID: rowId, LastLoginAt: at }]);
	}
}
