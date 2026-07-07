import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM encryption for secrets at rest (per-user OAuth refresh tokens).
 *
 * Envelope format: `v1:<keyId>:<iv_b64>:<tag_b64>:<ct_b64>` (base64, not url-safe).
 * The `keyId` prefix lets old keys stay available for decryption after rotation:
 * the active key encrypts new writes; any key in the ring can decrypt.
 */

const VERSION = 'v1';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length

export interface Keyring {
	activeKeyId: string;
	keys: Map<string, Buffer>; // keyId -> 32-byte key
}

/**
 * Parses `DATA_ENCRYPTION_KEY` — comma-separated `keyId:base64(32B)` entries.
 * The first entry is the active key used for new encryptions; all entries can
 * decrypt. Throws if malformed so misconfiguration fails fast at startup.
 * @param raw - Raw `DATA_ENCRYPTION_KEY` env value.
 * @returns The parsed keyring, with the first entry marked active.
 * @throws {Error} If `raw` is empty, an entry is malformed, a key doesn't decode to `KEY_BYTES` bytes, or a key id is duplicated.
 */
export function parseKeyring(raw: string): Keyring {
	const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
	if (entries.length === 0) throw new Error('DATA_ENCRYPTION_KEY is empty');

	const keys = new Map<string, Buffer>();
	let activeKeyId = '';
	for (const entry of entries) {
		const sep = entry.indexOf(':');
		if (sep <= 0) throw new Error(`Malformed DATA_ENCRYPTION_KEY entry (expected keyId:base64): ${entry.slice(0, 8)}…`);
		const keyId = entry.slice(0, sep);
		const key = Buffer.from(entry.slice(sep + 1), 'base64');
		if (key.length !== KEY_BYTES) {
			throw new Error(`DATA_ENCRYPTION_KEY '${keyId}' must decode to ${KEY_BYTES} bytes, got ${key.length}`);
		}
		if (keys.has(keyId)) throw new Error(`Duplicate DATA_ENCRYPTION_KEY id '${keyId}'`);
		if (!activeKeyId) activeKeyId = keyId;
		keys.set(keyId, key);
	}
	return { activeKeyId, keys };
}

/**
 * Encrypts a UTF-8 string with the keyring's active key.
 * @param plaintext - The secret to encrypt.
 * @param keyring - Keyring providing the active key.
 * @returns The versioned ciphertext envelope (`v1:<keyId>:<iv_b64>:<tag_b64>:<ct_b64>`).
 * @throws {Error} If the active key id is not present in the keyring.
 */
export function encryptSecret(plaintext: string, keyring: Keyring): string {
	const key = keyring.keys.get(keyring.activeKeyId);
	if (!key) throw new Error(`Active key '${keyring.activeKeyId}' not present in keyring`);
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [VERSION, keyring.activeKeyId, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * Decrypts an envelope produced by {@link encryptSecret}. Throws on tampering or unknown key.
 * @param envelope - The versioned ciphertext envelope to decrypt.
 * @param keyring - Keyring used to look up the decryption key by id.
 * @returns The original UTF-8 plaintext.
 * @throws {Error} If the envelope is malformed, uses an unsupported version, references an unknown key id, or the auth tag fails to verify.
 */
export function decryptSecret(envelope: string, keyring: Keyring): string {
	const parts = envelope.split(':');
	if (parts.length !== 5) throw new Error('Malformed ciphertext envelope');
	const [version, keyId, ivB64, tagB64, ctB64] = parts;
	if (version !== VERSION) throw new Error(`Unsupported ciphertext version '${version}'`);

	const key = keyring.keys.get(keyId);
	if (!key) throw new Error(`No decryption key for keyId '${keyId}'`);

	const iv = Buffer.from(ivB64, 'base64');
	const tag = Buffer.from(tagB64, 'base64');
	const ct = Buffer.from(ctB64, 'base64');

	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Constant-time string comparison for CSRF `state` / opaque tokens.
 * @param a - First string to compare.
 * @param b - Second string to compare.
 * @returns True if `a` and `b` are equal.
 */
export function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}
