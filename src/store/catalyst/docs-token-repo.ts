import type { DocsToken, DocsTokenStore } from '../types';
import type { CatalystNoSqlClient, Item } from './nosql-client';
import { numOf, strOf } from './nosql-helpers';

const TABLE = 'DocsTokens';

/**
 * Maps a domain `DocsToken` to its `DocsTokens` NoSQL item (partition = `UserId`).
 * @param token - The token record to serialize.
 * @returns The item payload.
 */
function toItem(token: DocsToken): Item {
	return {
		UserId: token.userId,
		RefreshTokenEnc: token.refreshTokenEnc,
		UpdatedAt: token.updatedAt,
	};
}

/**
 * Maps a raw `DocsTokens` NoSQL item to the domain `DocsToken` shape.
 * @param item - The decoded NoSQL item.
 * @returns The parsed token record.
 */
function fromItem(item: Item): DocsToken {
	return {
		userId: strOf(item.UserId),
		refreshTokenEnc: strOf(item.RefreshTokenEnc),
		updatedAt: numOf(item.UpdatedAt),
	};
}

export class CatalystDocsTokenStore implements DocsTokenStore {
	/**
	 * Creates a store backed by the `DocsTokens` NoSQL table.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Inserts or replaces a user's stored docs-connection OAuth token (put/overwrite).
	 * @param token - The token record to store, keyed by `token.userId`.
	 * @throws {Error} If the insert request fails.
	 */
	async put(token: DocsToken): Promise<void> {
		await this.client.insertItem(TABLE, toItem(token));
	}

	/**
	 * Fetches a user's stored docs-connection OAuth token.
	 * @param userId - User id (ZUID) to look up.
	 * @returns The token record, or `null` if none is stored.
	 * @throws {Error} If the underlying query fails.
	 */
	async get(userId: string): Promise<DocsToken | null> {
		const item = await this.client.getItem(TABLE, { partition: userId });
		return item ? fromItem(item) : null;
	}

	/**
	 * Deletes a user's stored docs-connection OAuth token. A no-op if none exists.
	 * @param userId - User id (ZUID) whose token should be removed.
	 * @throws {Error} If the delete request fails.
	 */
	async delete(userId: string): Promise<void> {
		await this.client.deleteItem(TABLE, { partition: userId });
	}
}
