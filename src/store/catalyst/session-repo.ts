import type { Session, SessionStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { findRowIdByKey, findRowIdsByKey, getOneByKey, num } from './helpers';
import type { Row } from './zcql';

const TABLE = 'Sessions';

function toRow(session: Session): Row {
	return {
		SessionId: session.sessionId,
		UserId: session.userId,
		CreatedAt: session.createdAt,
		ExpiresAt: session.expiresAt,
		LastSeenAt: session.lastSeenAt,
	};
}

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
	constructor(private readonly client: CatalystDataStoreClient) {}

	async create(session: Session): Promise<void> {
		await this.client.insertRows(TABLE, [toRow(session)]);
	}

	async get(sessionId: string): Promise<Session | null> {
		const row = await getOneByKey(this.client, TABLE, 'SessionId', sessionId);
		return row ? fromRow(row) : null;
	}

	async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'SessionId', sessionId);
		if (rowId) await this.client.updateRows(TABLE, [{ ROWID: rowId, LastSeenAt: lastSeenAt, ExpiresAt: expiresAt }]);
	}

	async delete(sessionId: string): Promise<void> {
		const rowId = await findRowIdByKey(this.client, TABLE, 'SessionId', sessionId);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}

	async deleteAllForUser(userId: string): Promise<void> {
		const rowIds = await findRowIdsByKey(this.client, TABLE, 'UserId', userId);
		await Promise.all(rowIds.map((id) => this.client.deleteRow(TABLE, id)));
	}
}
