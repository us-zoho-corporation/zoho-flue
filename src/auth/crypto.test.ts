import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseKeyring, safeEqual, type Keyring } from './crypto';

/**
 * Builds a `DATA_ENCRYPTION_KEY`-formatted `keyId:base64(32B)` entry for test fixtures.
 * @param id - The key id to pair with a freshly generated random 32-byte key.
 * @returns A single `keyId:base64` keyring entry.
 */
const key = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;

describe('parseKeyring', () => {
	it('parses a single key, marking it active', () => {
		const ring = parseKeyring(key('k1'));
		expect(ring.activeKeyId).toBe('k1');
		expect(ring.keys.size).toBe(1);
	});

	it('marks the first of several keys active but keeps all', () => {
		const ring = parseKeyring(`${key('k1')}, ${key('k2')}`);
		expect(ring.activeKeyId).toBe('k1');
		expect(ring.keys.size).toBe(2);
		expect(ring.keys.has('k2')).toBe(true);
	});

	it('rejects empty, malformed, wrong-length, and duplicate keys', () => {
		expect(() => parseKeyring('')).toThrow();
		expect(() => parseKeyring('noseparator')).toThrow();
		expect(() => parseKeyring('k1:' + Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
		expect(() => parseKeyring(`${key('k1')},${key('k1')}`)).toThrow(/Duplicate/);
	});
});

describe('encryptSecret / decryptSecret', () => {
	const ring = parseKeyring(key('k1'));

	it('round-trips a secret', () => {
		const env = encryptSecret('refresh-token-xyz', ring);
		expect(env.startsWith('v1:k1:')).toBe(true);
		expect(decryptSecret(env, ring)).toBe('refresh-token-xyz');
	});

	it('produces distinct ciphertexts for the same input (random IV)', () => {
		expect(encryptSecret('same', ring)).not.toBe(encryptSecret('same', ring));
	});

	it('throws when the ciphertext is tampered with', () => {
		const env = encryptSecret('secret', ring);
		const parts = env.split(':');
		const ct = Buffer.from(parts[4], 'base64');
		ct[0] ^= 0xff; // flip a byte
		parts[4] = ct.toString('base64');
		expect(() => decryptSecret(parts.join(':'), ring)).toThrow();
	});

	it('rejects malformed envelopes and unknown versions', () => {
		expect(() => decryptSecret('too:few:parts', ring)).toThrow(/Malformed/);
		expect(() => decryptSecret('v2:k1:a:b:c', ring)).toThrow(/version/);
	});
});

describe('key rotation', () => {
	it('decrypts old envelopes after a new active key is added', () => {
		const oldRing = parseKeyring(key('k1'));
		const env = encryptSecret('legacy', oldRing);

		// New ring: k2 active, k1 still present for decryption.
		const rotated: Keyring = {
			activeKeyId: 'k2',
			keys: new Map([...oldRing.keys, ['k2', randomBytes(32)]]),
		};
		expect(decryptSecret(env, rotated)).toBe('legacy');
		expect(encryptSecret('fresh', rotated).startsWith('v1:k2:')).toBe(true);
	});

	it('throws when no key matches the envelope keyId', () => {
		const env = encryptSecret('x', parseKeyring(key('k1')));
		expect(() => decryptSecret(env, parseKeyring(key('k2')))).toThrow(/No decryption key/);
	});
});

describe('safeEqual', () => {
	it('matches equal strings and rejects others', () => {
		expect(safeEqual('abc', 'abc')).toBe(true);
		expect(safeEqual('abc', 'abd')).toBe(false);
		expect(safeEqual('abc', 'abcd')).toBe(false);
	});
});
