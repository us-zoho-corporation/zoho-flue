import type {
	McpServer,
	McpServerStore,
	Preferences,
	PreferenceStore,
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

const clone = <T>(v: T): T => structuredClone(v);

class MemoryUserStore implements UserStore {
	private readonly rows = new Map<string, User>();

	async upsert(user: User): Promise<User> {
		this.rows.set(user.userId, clone(user));
		return clone(user);
	}
	async getById(userId: string): Promise<User | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	async touchLogin(userId: string, at: number): Promise<void> {
		const row = this.rows.get(userId);
		if (row) row.lastLoginAt = at;
	}
}

class MemoryTokenStore implements TokenStore {
	private readonly rows = new Map<string, StoredToken>();

	async put(token: StoredToken): Promise<void> {
		this.rows.set(token.userId, clone(token));
	}
	async get(userId: string): Promise<StoredToken | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	async delete(userId: string): Promise<void> {
		this.rows.delete(userId);
	}
}

class MemorySessionStore implements SessionStore {
	private readonly rows = new Map<string, Session>();

	async create(session: Session): Promise<void> {
		this.rows.set(session.sessionId, clone(session));
	}
	async get(sessionId: string): Promise<Session | null> {
		const row = this.rows.get(sessionId);
		return row ? clone(row) : null;
	}
	async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
		const row = this.rows.get(sessionId);
		if (row) {
			row.lastSeenAt = lastSeenAt;
			row.expiresAt = expiresAt;
		}
	}
	async delete(sessionId: string): Promise<void> {
		this.rows.delete(sessionId);
	}
	async deleteAllForUser(userId: string): Promise<void> {
		for (const [id, row] of this.rows) {
			if (row.userId === userId) this.rows.delete(id);
		}
	}
}

class MemoryPreferenceStore implements PreferenceStore {
	private readonly rows = new Map<string, Preferences>();

	async get(userId: string): Promise<Preferences | null> {
		const row = this.rows.get(userId);
		return row ? clone(row) : null;
	}
	async put(prefs: Preferences): Promise<void> {
		this.rows.set(prefs.userId, clone(prefs));
	}
}

class MemoryMcpServerStore implements McpServerStore {
	private readonly rows = new Map<string, McpServer>();

	async listForUser(userId: string): Promise<McpServer[]> {
		return [...this.rows.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => a.createdAt - b.createdAt)
			.map(clone);
	}
	async get(userId: string, id: string): Promise<McpServer | null> {
		const row = this.rows.get(id);
		return row && row.userId === userId ? clone(row) : null;
	}
	async create(server: McpServer): Promise<void> {
		this.rows.set(server.id, clone(server));
	}
	async update(server: McpServer): Promise<void> {
		this.rows.set(server.id, clone(server));
	}
	async delete(userId: string, id: string): Promise<void> {
		const row = this.rows.get(id);
		if (row && row.userId === userId) this.rows.delete(id);
	}
}

/** Builds a fresh in-memory `Stores` instance. */
export function createMemoryStores(): Stores {
	return {
		users: new MemoryUserStore(),
		tokens: new MemoryTokenStore(),
		sessions: new MemorySessionStore(),
		preferences: new MemoryPreferenceStore(),
		mcpServers: new MemoryMcpServerStore(),
	};
}
