import type { ConversationOwnerStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

const TABLE = 'ConversationOwners';

/**
 * Fetches the deterministically-first row for `conversationId` (lowest ROWID),
 * so that if two requests race to claim the same id, every reader converges on
 * the same winning row rather than whichever insert happened to run last.
 * @param client - Data Store REST client to query with.
 * @param conversationId - Conversation id to look up.
 * @returns The matching row, or `null` if no row matches.
 * @throws {Error} If the underlying ZCQL query fails.
 */
async function getFirstByConversationId(client: CatalystDataStoreClient, conversationId: string): Promise<Row | null> {
	const raw = await client.query(
		`SELECT * FROM ${TABLE} WHERE ConversationId = ${escapeZcqlString(conversationId)} ORDER BY ROWID LIMIT 1`,
	);
	return unwrapRows(TABLE, raw)[0] ?? null;
}

export class CatalystConversationOwnerStore implements ConversationOwnerStore {
	/**
	 * Creates a store backed by the `ConversationOwners` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Claims `conversationId` for `userId` if absent; on a concurrent-claim race,
	 * returns the user id of whichever row ends up with the lowest ROWID instead
	 * of `userId`.
	 * @param conversationId - Conversation id to claim.
	 * @param userId - The user id claiming it, if it's not already claimed.
	 * @returns The winning owner's user id — either `userId` or another user's.
	 * @throws {Error} If the lookup query or the insert request fails.
	 */
	async claimOrGetOwner(conversationId: string, userId: string): Promise<string> {
		const existing = await getFirstByConversationId(this.client, conversationId);
		if (existing) return String(existing.UserId);

		await this.client.insertRows(TABLE, [{ ConversationId: conversationId, UserId: userId, CreatedAt: Date.now() }]);
		const winner = await getFirstByConversationId(this.client, conversationId);
		return winner ? String(winner.UserId) : userId;
	}
}
