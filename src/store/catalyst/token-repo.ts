import type { StoredToken, TokenStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, getOneByKey, num, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'UserTokens';

function toRow(token: StoredToken): Row {
	return {
		UserId: token.userId,
		RefreshTokenEnc: token.refreshTokenEnc,
		Scopes: token.scopes.join(' '),
		AccountsServer: token.accountsServer,
		UpdatedAt: token.updatedAt,
	};
}

function fromRow(row: Row): StoredToken {
	const scopes = String(row.Scopes ?? '').trim();
	return {
		userId: String(row.UserId),
		refreshTokenEnc: String(row.RefreshTokenEnc ?? ''),
		scopes: scopes ? scopes.split(/\s+/) : [],
		accountsServer: String(row.AccountsServer ?? ''),
		updatedAt: num(row.UpdatedAt),
	};
}

export class CatalystTokenStore implements TokenStore {
	constructor(private readonly client: CatalystDataStoreClient) {}

	async put(token: StoredToken): Promise<void> {
		await upsertByKey(this.client, TABLE, 'UserId', token.userId, toRow(token));
	}

	async get(userId: string): Promise<StoredToken | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	async delete(userId: string): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'UserId', userId);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}
}
