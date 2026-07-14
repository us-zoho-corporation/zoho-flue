/**
 * Catalyst-agnostic persistence interfaces. The app depends only on these; the
 * concrete backend (Catalyst Data Store or in-memory) is chosen by `getStores()`
 * in `./index.ts`. `userId` is the Zoho user id (ZUID) — a stable natural key,
 * not the Catalyst ROWID.
 */

export interface User {
	userId: string;
	email: string;
	displayName: string;
	firstName: string;
	lastName: string;
	photoId: string | null;
	createdAt: number; // epoch ms
	lastLoginAt: number; // epoch ms
}

/** Per-user OAuth grant: the encrypted refresh token plus the scopes it was granted. */
export interface StoredToken {
	userId: string;
	refreshTokenEnc: string; // AES-256-GCM envelope (see src/auth/crypto.ts)
	scopes: string[]; // granted scopes
	accountsServer: string; // DC-aware accounts host (e.g. https://accounts.zoho.com)
	updatedAt: number; // epoch ms
}

export interface Session {
	sessionId: string; // opaque; the signed-cookie value
	userId: string;
	createdAt: number; // epoch ms
	expiresAt: number; // epoch ms
	lastSeenAt: number; // epoch ms
}

export interface Preferences {
	userId: string;
	preferredModelKey: string;
	data: Record<string, unknown>; // free-form JSON blob for future prefs
	updatedAt: number; // epoch ms
}

export interface UserStore {
	/** Insert or update a user by `userId`. Returns the stored record. */
	upsert(user: User): Promise<User>;
	getById(userId: string): Promise<User | null>;
	touchLogin(userId: string, at: number): Promise<void>;
}

export interface TokenStore {
	put(token: StoredToken): Promise<void>;
	get(userId: string): Promise<StoredToken | null>;
	delete(userId: string): Promise<void>;
}

export interface SessionStore {
	create(session: Session): Promise<void>;
	get(sessionId: string): Promise<Session | null>;
	touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void>;
	delete(sessionId: string): Promise<void>;
	deleteAllForUser(userId: string): Promise<void>;
}

export interface PreferenceStore {
	get(userId: string): Promise<Preferences | null>;
	put(prefs: Preferences): Promise<void>;
}

/** A user-connected external MCP server. */
export interface McpServer {
	id: string; // uuid
	userId: string;
	name: string;
	url: string;
	transport: 'http' | 'sse';
	authTokenEnc: string | null; // AES-256-GCM envelope (see src/auth/crypto.ts), or null
	enabled: boolean;
	createdAt: number; // epoch ms
	updatedAt: number; // epoch ms
}

export interface McpServerStore {
	listForUser(userId: string): Promise<McpServer[]>;
	get(userId: string, id: string): Promise<McpServer | null>;
	create(server: McpServer): Promise<void>;
	update(server: McpServer): Promise<void>;
	delete(userId: string, id: string): Promise<void>;
}

/**
 * Durable app-wide secrets (session-cookie signing key, refresh-token
 * encryption keyring) — deliberately not env vars, so they survive AppSail
 * redeploys/restarts and are shared across instances. See `src/auth/secrets-bootstrap.ts`.
 */
export interface SecretsStore {
	/** Fetches a previously-created secret value by key, if any. */
	get(key: string): Promise<string | null>;
	/**
	 * Creates `key` with `value` if it doesn't exist yet. If another process
	 * already created it (a boot-time race), returns that existing value instead
	 * of `value` — every caller converges on the same winning secret.
	 */
	createIfAbsent(key: string, value: string): Promise<string>;
}

/**
 * Records which user "owns" a conversation id, so the agent route can reject
 * any other user trying to read/drive it. Flue's own conversation id/persistence
 * has no user concept at all (the id is client-generated, global, and Flue's
 * store keys purely on it) — without this, any authenticated user who obtains
 * another user's conversation id can read their full message history. See
 * `src/agents/assistant.ts`'s `route` handler.
 */
export interface ConversationOwnerStore {
	/**
	 * Claims `conversationId` for `userId` if unclaimed yet (first turn ever sent
	 * to it). If another user already claimed it, returns their id instead of
	 * `userId` — first-writer-wins, same pattern as `SecretsStore.createIfAbsent`.
	 */
	claimOrGetOwner(conversationId: string, userId: string): Promise<string>;
}

/** Composition of every repository — the single dependency the app wires in. */
export interface Stores {
	users: UserStore;
	tokens: TokenStore;
	sessions: SessionStore;
	preferences: PreferenceStore;
	mcpServers: McpServerStore;
	secrets: SecretsStore;
	conversationOwners: ConversationOwnerStore;
}
