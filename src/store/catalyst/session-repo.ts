import type { Session, SessionStore } from '../types';
import { CatalystCacheClient, msToExpiryHours } from './cache-client';

// Cache keys (max 50 chars): a session body per id, plus a per-user index set.
// `sess:` + a 43-char base64url session id = 48 chars, within the limit.

/**
 * Builds the cache key for a session body.
 * @param sessionId - Opaque session id.
 * @returns The `sess:{sessionId}` cache key.
 */
const sessionKey = (sessionId: string): string => `sess:${sessionId}`;

/**
 * Builds the cache key for a user's session-id index set.
 * @param userId - Owning user's id (ZUID).
 * @returns The `usess:{userId}` cache key.
 */
const userIndexKey = (userId: string): string => `usess:${userId}`;
// The per-user index is pinned to Cache's 48h max so it always outlives the
// user's (<= 2h) sessions — otherwise a logout-everywhere could miss a live one.
const INDEX_EXPIRY_HOURS = 48;

/**
 * Serializes a session to its cache value.
 * @param session - The session to serialize.
 * @returns The JSON string stored under `sess:{id}`.
 */
function toValue(session: Session): string {
	return JSON.stringify(session);
}

/**
 * Parses a cached session value back to a `Session`.
 * @param raw - The stored JSON string, or `null`.
 * @returns The parsed session, or `null` if absent/unparseable.
 */
function fromValue(raw: string | null): Session | null {
	if (!raw) return null;
	try { return JSON.parse(raw) as Session; } catch { return null; }
}

/**
 * Computes the Cache `expiry_in_hours` for a session from its absolute expiry.
 * @param expiresAt - Session expiry (epoch ms).
 * @returns Whole-hours TTL (1–48).
 */
function sessionExpiryHours(expiresAt: number): number {
	return msToExpiryHours(expiresAt - Date.now());
}

export class CatalystSessionStore implements SessionStore {
	/**
	 * Creates a store backed by a Catalyst Cache segment.
	 * @param cache - Cache REST client to read/write through.
	 */
	constructor(private readonly cache: CatalystCacheClient) {}

	/**
	 * Inserts a new session and records it in the owner's index set.
	 * @param session - The session to create.
	 * @throws {Error} If a cache write fails.
	 */
	async create(session: Session): Promise<void> {
		await this.cache.put(sessionKey(session.sessionId), toValue(session), sessionExpiryHours(session.expiresAt));
		await this.addToIndex(session.userId, session.sessionId);
	}

	/**
	 * Fetches a session by its id.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @returns The session, or `null` if absent/expired.
	 * @throws {Error} If the cache read fails.
	 */
	async get(sessionId: string): Promise<Session | null> {
		return fromValue(await this.cache.get(sessionKey(sessionId)));
	}

	/**
	 * Updates a session's last-seen and expiry timestamps (re-extending its TTL).
	 * A no-op if the session doesn't exist.
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @param lastSeenAt - New last-seen timestamp (epoch ms).
	 * @param expiresAt - New expiry timestamp (epoch ms).
	 * @throws {Error} If the cache read/write fails.
	 */
	async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
		const session = await this.get(sessionId);
		if (!session) return;
		const updated: Session = { ...session, lastSeenAt, expiresAt };
		await this.cache.update(sessionKey(sessionId), toValue(updated), sessionExpiryHours(expiresAt));
	}

	/**
	 * Deletes a session by its id. A no-op if it doesn't exist. The owner's index
	 * entry is left to lapse (deleting an already-gone session is a no-op).
	 * @param sessionId - Opaque session id (the signed-cookie value).
	 * @throws {Error} If the cache delete fails.
	 */
	async delete(sessionId: string): Promise<void> {
		await this.cache.delete(sessionKey(sessionId));
	}

	/**
	 * Deletes every session belonging to a user (logout-everywhere) via the index
	 * set, then clears the index.
	 * @param userId - User id (ZUID) whose sessions should be removed.
	 * @throws {Error} If a cache read/delete fails.
	 */
	async deleteAllForUser(userId: string): Promise<void> {
		const ids = await this.readIndex(userId);
		await Promise.all(ids.map((id) => this.cache.delete(sessionKey(id))));
		await this.cache.delete(userIndexKey(userId));
	}

	/**
	 * Reads a user's session-id index set.
	 * @param userId - User id (ZUID).
	 * @returns The session ids currently indexed for the user (may include lapsed ids).
	 * @throws {Error} If the cache read fails.
	 */
	private async readIndex(userId: string): Promise<string[]> {
		const raw = await this.cache.get(userIndexKey(userId));
		if (!raw) return [];
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			return [];
		}
	}

	/**
	 * Adds a session id to a user's index set (read-modify-write). Under Flue's
	 * single-owner deployment concurrent writes for one user are not expected;
	 * a lost update would only drop an id from logout-everywhere, not corrupt state.
	 * @param userId - Owning user's id (ZUID).
	 * @param sessionId - Session id to index.
	 * @throws {Error} If the cache read/write fails.
	 */
	private async addToIndex(userId: string, sessionId: string): Promise<void> {
		const existing = await this.readIndex(userId);
		if (existing.includes(sessionId)) return;
		const next = JSON.stringify([...existing, sessionId]);
		if (existing.length === 0) await this.cache.put(userIndexKey(userId), next, INDEX_EXPIRY_HOURS);
		else await this.cache.update(userIndexKey(userId), next, INDEX_EXPIRY_HOURS);
	}
}
