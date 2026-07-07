import type { Session, SessionStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, findRowIdsByKey, getOneByKey, num } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Sessions';

/**
 * Maps a domain `Session` to its `Sessions` table row representation.
 * @param session - The session to serialize.
 * @returns The row payload ready for `insertRows`.
 */
function toRow(session: Session): Row {
	return {
		SessionId: session.sessionId,
		UserId: session.userId,
		CreatedAt: session.createdAt,
		ExpiresAt: session.expiresAt,
		LastSeenAt: session.lastSeenAt,
	};
}

/**
 * Maps a raw `Sessions` table row to the domain `Session` shape.
 * @param row - The raw Data Store row.
 * @returns The parsed session.
 */
function fromRow(row: Row): Session {
	return {
		sessionId: String(row.SessionId),
		userId: String(row.UserId),
		createdAt: num(row.CreatedAt),
		expiresAt: num(row.ExpiresAt),
		lastSeenAt: num(row.LastSeenAt),
	};
}

export class CatalystSessionStore implements SessionStore {
	/**
	 * Creates a store backed by the `Sessions` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * Inserts a new session row.
	 * @param session - The session to create.
	 * @throws {Error} If the insert request fails.
	 */
	async create(session: Session): Promise<void> {
		await this.client.insertRows(TABLE, [toRow(session)]);
	}

	/**
	 * Fetches a session by its id.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @returns The session, or `null` if it doesn't exist.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async get(sessionId: string): Promise<Session | null> {
		const row = await getOneByKey(this.client, TABLE, 'SessionId', sessionId);
		return row ? fromRow(row) : null;
	}

	/**
	 * Updates a session's last-seen and expiry timestamps. A no-op if the session
	 * doesn't exist.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @param lastSeenAt - New last-seen timestamp (epoch ms).
	 * @param expiresAt - New expiry timestamp (epoch ms).
	 * @throws {Error} If the lookup query or the update request fails.
	 */
	async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'SessionId', sessionId);
		if (rowId) await this.client.updateRows(TABLE, [{ ROWID: rowId, LastSeenAt: lastSeenAt, ExpiresAt: expiresAt }]);
	}

	/**
	 * Deletes a session by its id. A no-op if it doesn't exist.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @throws {Error} If the lookup query or the delete request fails.
	 */
	async delete(sessionId: string): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'SessionId', sessionId);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}

	/**
	 * Deletes every session belonging to a user (e.g. on logout-everywhere), in parallel.
	 * @param userId - User id (ZUID) whose sessions should be removed.
	 * @throws {Error} If the lookup query or any delete request fails.
	 */
	async deleteAllForUser(userId: string): Promise<void> {
		const rowIds = await findRowIdsByKey(this.client, TABLE, 'UserId', userId);
		await Promise.all(rowIds.map((id) => this.client.deleteRow(TABLE, id)));
	}
}
