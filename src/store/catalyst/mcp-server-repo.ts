import type { McpServer, McpServerStore } from '../types';
import type { CatalystNoSqlClient, Item } from './nosql-client';
import { boolOf, numOf, strOf, strOrNull } from './nosql-helpers';

const TABLE = 'McpServers';

/**
 * Maps a domain `McpServer` to its `McpServers` NoSQL item
 * (partition = `UserId`, sort = `Id`).
 * @param s - The server record to serialize.
 * @returns The item payload; a null `authTokenEnc` is omitted (absent decodes to null).
 */
function toItem(s: McpServer): Item {
	return {
		UserId: s.userId,
		Id: s.id,
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
 * Maps a raw `McpServers` NoSQL item to the domain `McpServer` shape.
 * @param item - The decoded NoSQL item.
 * @returns The parsed server record; `transport` defaults to `'http'` unless exactly `'sse'`.
 */
function fromItem(item: Item): McpServer {
	return {
		id: strOf(item.Id),
		userId: strOf(item.UserId),
		name: strOf(item.Name),
		url: strOf(item.Url),
		transport: item.Transport === 'sse' ? 'sse' : 'http',
		authTokenEnc: strOrNull(item.AuthTokenEnc),
		enabled: boolOf(item.Enabled),
		createdAt: numOf(item.CreatedAt),
		updatedAt: numOf(item.UpdatedAt),
	};
}

export class CatalystMcpServerStore implements McpServerStore {
	/**
	 * Creates a store backed by the `McpServers` NoSQL table.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Lists every MCP server connected by a given user, oldest first. Ownership is
	 * structural — the partition key is `UserId`, so a query only ever returns that
	 * user's servers.
	 * @param userId - Owning user's id (ZUID).
	 * @returns The user's servers, ordered by `createdAt`.
	 * @throws {Error} If the underlying query fails.
	 */
	async listForUser(userId: string): Promise<McpServer[]> {
		const rows = await this.client.queryPartition(TABLE, userId);
		return rows.map(fromItem).sort((a, b) => a.createdAt - b.createdAt);
	}

	/**
	 * Fetches a single server owned by a given user.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @returns The server, or `null` if it doesn't exist or isn't owned by `userId`.
	 * @throws {Error} If the underlying query fails.
	 */
	async get(userId: string, id: string): Promise<McpServer | null> {
		const item = await this.client.getItem(TABLE, { partition: userId, sort: id }, 'Id');
		return item ? fromItem(item) : null;
	}

	/**
	 * Inserts a new MCP server.
	 * @param server - The server record to create.
	 * @throws {Error} If the insert request fails.
	 */
	async create(server: McpServer): Promise<void> {
		await this.client.insertItem(TABLE, toItem(server));
	}

	/**
	 * Replaces an existing server owned by `server.userId`. A no-op if no such
	 * server exists (wrong owner or unknown id) — the `(UserId, Id)` key won't match.
	 * @param server - The server record with updated field values.
	 * @throws {Error} If the existence check or the write fails.
	 */
	async update(server: McpServer): Promise<void> {
		const existing = await this.get(server.userId, server.id);
		if (existing) await this.client.insertItem(TABLE, toItem(server));
	}

	/**
	 * Deletes a server owned by `userId`. A no-op if no such row exists — deleting
	 * by the `(userId, id)` key naturally can't touch another user's item.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @throws {Error} If the delete request fails.
	 */
	async delete(userId: string, id: string): Promise<void> {
		await this.client.deleteItem(TABLE, { partition: userId, sort: id });
	}
}
