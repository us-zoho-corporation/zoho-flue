import type { StoredToken, TokenStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, getOneByKey, num, upsertByKey } from './helpers';
import type { Row } from './zcql';

const TABLE = 'UserTokens';

/**
 * Maps a domain `StoredToken` to its `UserTokens` table row representation.
 * @param token - The token record to serialize.
 * @returns The row payload ready for `insertRows`/`updateRows`; `scopes` is space-joined.
 */
function toRow(token: StoredToken): Row {
	return {
		UserId: token.userId,
		RefreshTokenEnc: token.refreshTokenEnc,
		Scopes: token.scopes.join(' '),
		AccountsServer: token.accountsServer,
		UpdatedAt: token.updatedAt,
	};
}

/**
 * Maps a raw `UserTokens` table row to the domain `StoredToken` shape.
 * @param row - The raw Data Store row.
 * @returns The parsed token record; `scopes` is split on whitespace, or `[]` if empty.
 */
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
	/**
	 * Creates a store backed by the `UserTokens` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Inserts or replaces a user's stored OAuth token.
	 * @param token - The token record to store, keyed by `token.userId`.
	 * @throws {Error} If the lookup query or the insert/update request fails.
	 */
	async put(token: StoredToken): Promise<void> {
		await upsertByKey(this.client, TABLE, 'UserId', token.userId, toRow(token));
	}

	/**
	 * Fetches a user's stored OAuth token.
	 * @param userId - User id (ZUID) to look up.
	 * @returns The token record, or `null` if none is stored.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async get(userId: string): Promise<StoredToken | null> {
		const row = await getOneByKey(this.client, TABLE, 'UserId', userId);
		return row ? fromRow(row) : null;
	}

	/**
	 * Deletes a user's stored OAuth token. A no-op if none exists.
	 * @param userId - User id (ZUID) whose token should be removed.
	 * @throws {Error} If the lookup query or the delete request fails.
	 */
	async delete(userId: string): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'UserId', userId);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}
}
