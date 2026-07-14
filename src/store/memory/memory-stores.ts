import type {
	ConversationOwnerStore,
	McpServer,
	McpServerStore,
	Preferences,
	PreferenceStore,
	SecretsStore,
	Session,
	SessionStore,
	StoredToken,
	Stores,
	TokenStore,
	User,
	UserStore,
} from '../types';

/**
 * In-memory `Map`-backed implementations of the store interfaces. Used for unit
 * tests and for local dev before the Catalyst Data Store tables exist. State is
 * process-local and non-durable — never use in production.
 *
 * Stored objects are cloned on read/write so callers can't mutate internal state.
 */

/**
 * Deep-clones a value so callers can't mutate a store's internal state.
 * @param v - The value to clone.
 * @returns A structurally-cloned copy of `v`.
 */
const clone = <T>(v: T): T => structuredClone(v);

class MemoryUserStore implements UserStore {
	private readonly rows = new Map<string, User>();

	/**
	 * Inserts or replaces a user keyed by `user.userId`.
	 * @param user - The user record to store.
	 * @returns A clone of the stored `user` record.
	 */
	async upsert(user: User): Promise<User> {
		this.rows.set(user.userId, clone(user));
		return clone(user);
	}
	/**
	 * Fetches a user by id.
	 * @param userId - User id (ZUID) to look up.
	 * @returns A clone of the matching user, or `null` if none exists.
	 */
	async getById(userId: string): Promise<User | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	/**
	 * Updates a user's last-login timestamp in place. A no-op if the user doesn't exist.
	 * @param userId - User id (ZUID) to update.
	 * @param at - New last-login timestamp (epoch ms).
	 */
	async touchLogin(userId: string, at: number): Promise<void> {
		const row = this.rows.get(userId);
		if (row) row.lastLoginAt = at;
	}
}

class MemoryTokenStore implements TokenStore {
	private readonly rows = new Map<string, StoredToken>();

	/**
	 * Inserts or replaces a user's stored OAuth token.
	 * @param token - The token record to store, keyed by `token.userId`.
	 */
	async put(token: StoredToken): Promise<void> {
		this.rows.set(token.userId, clone(token));
	}
	/**
	 * Fetches a user's stored OAuth token.
	 * @param userId - User id (ZUID) to look up.
	 * @returns A clone of the stored token, or `null` if none exists.
	 */
	async get(userId: string): Promise<StoredToken | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	/**
	 * Deletes a user's stored OAuth token, if any.
	 * @param userId - User id (ZUID) whose token should be removed.
	 */
	async delete(userId: string): Promise<void> {
		this.rows.delete(userId);
	}
}

class MemorySessionStore implements SessionStore {
	private readonly rows = new Map<string, Session>();

	/**
	 * Inserts a new session.
	 * @param session - The session to create.
	 */
	async create(session: Session): Promise<void> {
		this.rows.set(session.sessionId, clone(session));
	}
	/**
	 * Fetches a session by its id.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @returns A clone of the session, or `null` if it doesn't exist.
	 */
	async get(sessionId: string): Promise<Session | null> {
		const row = this.rows.get(sessionId);
		return row ? clone(row) : null;
	}
	/**
	 * Updates a session's last-seen and expiry timestamps in place. A no-op if
	 * the session doesn't exist.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @param lastSeenAt - New last-seen timestamp (epoch ms).
	 * @param expiresAt - New expiry timestamp (epoch ms).
	 */
	async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
		const row = this.rows.get(sessionId);
		if (row) {
			row.lastSeenAt = lastSeenAt;
			row.expiresAt = expiresAt;
		}
	}
	/**
	 * Deletes a session by its id, if it exists.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 */
	async delete(sessionId: string): Promise<void> {
		this.rows.delete(sessionId);
	}
	/**
	 * Deletes every session belonging to a user.
	 * @param userId - User id (ZUID) whose sessions should be removed.
	 */
	async deleteAllForUser(userId: string): Promise<void> {
		for (const [id, row] of this.rows) {
			if (row.userId === userId) this.rows.delete(id);
		}
	}
}

class MemoryPreferenceStore implements PreferenceStore {
	private readonly rows = new Map<string, Preferences>();

	/**
	 * Fetches a user's stored preferences.
	 * @param userId - User id (ZUID) to look up.
	 * @returns A clone of the preferences, or `null` if none have been stored yet.
	 */
	async get(userId: string): Promise<Preferences | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	/**
	 * Inserts or replaces a user's preferences.
	 * @param prefs - The preferences to store, keyed by `prefs.userId`.
	 */
	async put(prefs: Preferences): Promise<void> {
		this.rows.set(prefs.userId, clone(prefs));
	}
}

class MemoryMcpServerStore implements McpServerStore {
	private readonly rows = new Map<string, McpServer>();

	/**
	 * Lists every MCP server connected by a given user, oldest first.
	 * @param userId - Owning user's id (ZUID).
	 * @returns Clones of the servers owned by `userId`, sorted by `createdAt`.
	 */
	async listForUser(userId: string): Promise<McpServer[]> {
		return [...this.rows.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => a.createdAt - b.createdAt)
			.map(clone);
	}
	/**
	 * Fetches a single server owned by a given user.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 * @returns A clone of the server, or `null` if it doesn't exist or isn't owned by `userId`.
	 */
	async get(userId: string, id: string): Promise<McpServer | null> {
		const row = this.rows.get(id);
		return row && row.userId === userId ? clone(row) : null;
	}
	/**
	 * Inserts a new MCP server row.
	 * @param server - The server record to create.
	 */
	async create(server: McpServer): Promise<void> {
		this.rows.set(server.id, clone(server));
	}
	/**
	 * Replaces an existing MCP server row by id (unconditionally, regardless of owner).
	 * @param server - The server record with updated field values.
	 */
	async update(server: McpServer): Promise<void> {
		this.rows.set(server.id, clone(server));
	}
	/**
	 * Deletes a server owned by `userId`. A no-op if no such row exists.
	 * @param userId - Owning user's id (ZUID).
	 * @param id - Server id.
	 */
	async delete(userId: string, id: string): Promise<void> {
		const row = this.rows.get(id);
		if (row && row.userId === userId) this.rows.delete(id);
	}
}

class MemorySecretsStore implements SecretsStore {
	private readonly rows = new Map<string, string>();

	/**
	 * Fetches a previously-created secret value by key.
	 * @param key - Secret key to look up.
	 * @returns The stored value, or `null` if `key` has never been created.
	 */
	async get(key: string): Promise<string | null> {
		return this.rows.get(key) ?? null;
	}
	/**
	 * Creates `key` with `value` if it doesn't already have one.
	 * @param key - Secret key to create.
	 * @param value - Value to store if `key` doesn't exist yet.
	 * @returns The stored value for `key` — `value`, or the pre-existing one.
	 */
	async createIfAbsent(key: string, value: string): Promise<string> {
		const existing = this.rows.get(key);
		if (existing !== undefined) return existing;
		this.rows.set(key, value);
		return value;
	}
}

class MemoryConversationOwnerStore implements ConversationOwnerStore {
	private readonly rows = new Map<string, string>();

	/**
	 * Claims a conversation id for a user if unclaimed, or returns the existing
	 * owner if another user already claimed it.
	 * @param conversationId - Conversation id to claim.
	 * @param userId - The user id claiming it, if it's not already claimed.
	 * @returns The winning owner's user id — `userId`, or the pre-existing one.
	 */
	async claimOrGetOwner(conversationId: string, userId: string): Promise<string> {
		const existing = this.rows.get(conversationId);
		if (existing !== undefined) return existing;
		this.rows.set(conversationId, userId);
		return userId;
	}
}

/**
 * Builds a fresh in-memory `Stores` instance.
 * @returns A new `Stores` with independent, empty in-memory backing maps.
 */
export function createMemoryStores(): Stores {
	return {
		users: new MemoryUserStore(),
		tokens: new MemoryTokenStore(),
		sessions: new MemorySessionStore(),
		preferences: new MemoryPreferenceStore(),
		mcpServers: new MemoryMcpServerStore(),
		secrets: new MemorySecretsStore(),
		conversationOwners: new MemoryConversationOwnerStore(),
	};
}
