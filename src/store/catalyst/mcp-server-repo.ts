import type { McpServer, McpServerStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { num, textOrNull } from './helpers';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

const TABLE = 'McpServers';

/** Coerces a Data Store boolean cell (may arrive as boolean or 'true'/'false'). */
function boolOf(v: Row[string] | undefined): boolean {
	return v === true || v === 'true' || v === 1 || v === '1';
}

function toRow(s: McpServer): Row {
	return {
		Id: s.id,
		UserId: s.userId,
		Name: s.name,
		Url: s.url,
		Transport: s.transport,
		AuthTokenEnc: s.authTokenEnc,
		Enabled: s.enabled,
		CreatedAt: s.createdAt,
		UpdatedAt: s.updatedAt,
	};
}

function fromRow(row: Row): McpServer {
	return {
		id: String(row.Id),
		userId: String(row.UserId),
		name: String(row.Name ?? ''),
		url: String(row.Url ?? ''),
		transport: row.Transport === 'sse' ? 'sse' : 'http',
		authTokenEnc: textOrNull(row.AuthTokenEnc),
		enabled: boolOf(row.Enabled),
		createdAt: num(row.CreatedAt),
		updatedAt: num(row.UpdatedAt),
	};
}

export class CatalystMcpServerStore implements McpServerStore {
	constructor(private readonly client: CatalystDataStoreClient) {}

	/** ROWID of a server scoped to its owner (returns null if absent / not owned). */
	private async ownedRowId(userId: string, id: string): Promise<string | null> {
		const raw = await this.client.query(
			`SELECT ROWID FROM ${TABLE} WHERE Id = ${escapeZcqlString(id)} AND UserId = ${escapeZcqlString(userId)} LIMIT 1`,
		);
		const rowId = unwrapRows(TABLE, raw)[0]?.ROWID;
		return rowId != null ? String(rowId) : null;
	}

	async listForUser(userId: string): Promise<McpServer[]> {
		const raw = await this.client.query(
			`SELECT * FROM ${TABLE} WHERE UserId = ${escapeZcqlString(userId)} ORDER BY CreatedAt LIMIT 300`,
		);
		return unwrapRows(TABLE, raw).map(fromRow);
	}

	async get(userId: string, id: string): Promise<McpServer | null> {
		const raw = await this.client.query(
			`SELECT * FROM ${TABLE} WHERE Id = ${escapeZcqlString(id)} AND UserId = ${escapeZcqlString(userId)} LIMIT 1`,
		);
		const row = unwrapRows(TABLE, raw)[0];
		return row ? fromRow(row) : null;
	}

	async create(server: McpServer): Promise<void> {
		await this.client.insertRows(TABLE, [toRow(server)]);
	}

	async update(server: McpServer): Promise<void> {
		const rowId = await this.ownedRowId(server.userId, server.id);
		if (rowId) await this.client.updateRows(TABLE, [{ ...toRow(server), ROWID: rowId }]);
	}

	async delete(userId: string, id: string): Promise<void> {
		const rowId = await this.ownedRowId(userId, id);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}
}
