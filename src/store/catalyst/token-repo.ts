import type { StoredToken, TokenStore } from '../types';
import type { CatalystNoSqlClient, Item } from './nosql-client';
import { numOf, strOf } from './nosql-helpers';

const TABLE = 'UserTokens';

/**
 * Maps a domain `StoredToken` to its `UserTokens` NoSQL item (partition = `UserId`).
 * @param token - The token record to serialize.
 * @returns The item payload; `scopes` is stored as a native list.
 */
function toItem(token: StoredToken): Item {
	return {
		UserId: token.userId,
		RefreshTokenEnc: token.refreshTokenEnc,
		Scopes: token.scopes,
		AccountsServer: token.accountsServer,
		UpdatedAt: token.updatedAt,
	};
}

/**
 * Maps a raw `UserTokens` NoSQL item to the domain `StoredToken` shape.
 * @param item - The decoded NoSQL item.
 * @returns The parsed token record; `scopes` falls back to `[]` when absent.
 */
function fromItem(item: Item): StoredToken {
	return {
		userId: strOf(item.UserId),
		refreshTokenEnc: strOf(item.RefreshTokenEnc),
		scopes: Array.isArray(item.Scopes) ? item.Scopes.map(String) : [],
		accountsServer: strOf(item.AccountsServer),
		updatedAt: numOf(item.UpdatedAt),
	};
}

export class CatalystTokenStore implements TokenStore {
	/**
	 * Creates a store backed by the `UserTokens` NoSQL table.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Inserts or replaces a user's stored OAuth token (put/overwrite).
	 * @param token - The token record to store, keyed by `token.userId`.
	 * @throws {Error} If the insert request fails.
	 */
	async put(token: StoredToken): Promise<void> {
		await this.client.insertItem(TABLE, toItem(token));
	}

	/**
	 * Fetches a user's stored OAuth token.
	 * @param userId - User id (ZUID) to look up.
	 * @returns The token record, or `null` if none is stored.
	 * @throws {Error} If the underlying query fails.
	 */
	async get(userId: string): Promise<StoredToken | null> {
		const item = await this.client.getItem(TABLE, { partition: userId });
		return item ? fromItem(item) : null;
	}

	/**
	 * Deletes a user's stored OAuth token. A no-op if none exists.
	 * @param userId - User id (ZUID) whose token should be removed.
	 * @throws {Error} If the delete request fails.
	 */
	async delete(userId: string): Promise<void> {
		await this.client.deleteItem(TABLE, { partition: userId });
	}
}
