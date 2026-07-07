import type { McpServer, McpServerStore } from '../types';
import type { CatalystDataStoreClient } from './data-store-client';
import { num, textOrNull } from './helpers';
import { escapeZcqlString, unwrapRows, type Row } from './zcql';

const TABLE = 'McpServers';

/**
 * Coerces a Data Store boolean cell (may arrive as boolean or 'true'/'false').
 * @param v - The raw cell value, or `undefined` if the column was absent.
 * @returns `true` if the cell represents a truthy boolean value, else `false`.
 */
function boolOf(v: Row[string] | undefined): boolean {
	return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * Maps a domain `McpServer` to its `McpServers` table row representation.
 * @param s - The server record to serialize.
 * @returns The row payload ready for `insertRows`/`updateRows`.
 */
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

/**
 * Maps a raw `McpServers` table row to the domain `McpServer` shape.
 * @param row - The raw Data Store row.
 * @returns The parsed server record; `Transport` defaults to `'http'` unless it's exactly `'sse'`.
 */
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
	/**
	 * Creates a store backed by the `McpServers` Data Store table.
	 * @param client - Data Store REST client to read/write through.
	 */
	constructor(private readonly client: CatalystDataStoreClient) {}

	/**
	 * ROWID of a server scoped to its owner (returns null if absent / not owned).
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @returns The row's ROWID, or `null` if no server with that id is owned by `userId`.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	private async ownedRowId(userId: string, id: string): Promise<string | null> {
		const raw = await this.client.query(
			`SELECT ROWID FROM ${TABLE} WHERE Id = ${escapeZcqlString(id)} AND UserId = ${escapeZcqlString(userId)} LIMIT 1`,
		);
		const rowId = unwrapRows(TABLE, raw)[0]?.ROWID;
		return rowId != null ? String(rowId) : null;
	}

	/**
	 * Lists every MCP server connected by a given user, oldest first.
	 * @param userId - Owning user's id (ZUID).
	 * @returns Up to 300 servers owned by `userId`, ordered by `CreatedAt`.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async listForUser(userId: string): Promise<McpServer[]> {
		const raw = await this.client.query(
			`SELECT * FROM ${TABLE} WHERE UserId = ${escapeZcqlString(userId)} ORDER BY CreatedAt LIMIT 300`,
		);
		return unwrapRows(TABLE, raw).map(fromRow);
	}

	/**
	 * Fetches a single server owned by a given user.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @returns The server, or `null` if it doesn't exist or isn't owned by `userId`.
	 * @throws {Error} If the underlying ZCQL query fails.
	 */
	async get(userId: string, id: string): Promise<McpServer | null> {
		const raw = await this.client.query(
			`SELECT * FROM ${TABLE} WHERE Id = ${escapeZcqlString(id)} AND UserId = ${escapeZcqlString(userId)} LIMIT 1`,
		);
		const row = unwrapRows(TABLE, raw)[0];
		return row ? fromRow(row) : null;
	}

	/**
	 * Inserts a new MCP server row.
	 * @param server - The server record to create.
	 * @throws {Error} If the insert request fails.
	 */
	async create(server: McpServer): Promise<void> {
		await this.client.insertRows(TABLE, [toRow(server)]);
	}

	/**
	 * Updates an existing MCP server row owned by `server.userId`. A no-op if no
	 * such row exists (e.g. wrong owner or unknown id).
	 * @param server - The server record with updated field values.
	 * @throws {Error} If the ownership lookup or the update request fails.
	 */
	async update(server: McpServer): Promise<void> {
		const rowId = await this.ownedRowId(server.userId, server.id);
		if (rowId) await this.client.updateRows(TABLE, [{ ...toRow(server), ROWID: rowId }]);
	}

	/**
	 * Deletes a server owned by `userId`. A no-op if no such row exists.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @throws {Error} If the ownership lookup or the delete request fails.
	 */
	async delete(userId: string, id: string): Promise<void> {
		const rowId = await this.ownedRowId(userId, id);
		if (rowId) await this.client.deleteRow(TABLE, rowId);
	}
}
