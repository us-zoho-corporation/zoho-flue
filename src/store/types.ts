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

/** Composition of every repository — the single dependency the app wires in. */
export interface Stores {
	users: UserStore;
	tokens: TokenStore;
	sessions: SessionStore;
	preferences: PreferenceStore;
}
