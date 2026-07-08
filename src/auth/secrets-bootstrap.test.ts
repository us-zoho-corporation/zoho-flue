import { describe, it, expect } from 'vitest';
import { createMemoryStores } from '../store/memory/memory-stores';
import { parseKeyring } from './crypto';
import { initPersistedSecrets } from './secrets-bootstrap';

describe('initPersistedSecrets', () => {
	it('generates a session secret and a valid data-encryption keyring on first boot', async () => {
		const stores = createMemoryStores();
		const { sessionSecret, dataEncryptionKey } = await initPersistedSecrets(stores);

		expect(sessionSecret.length).toBeGreaterThan(0);
		expect(Buffer.from(sessionSecret, 'base64').length).toBe(32);

		const ring = parseKeyring(dataEncryptionKey);
		expect(ring.activeKeyId).toBe('k1');
		expect(ring.keys.get('k1')?.length).toBe(32);
	});

	it('reuses the same secrets on a second boot against the same stores', async () => {
		const stores = createMemoryStores();
		const first = await initPersistedSecrets(stores);
		const second = await initPersistedSecrets(stores);

		expect(second.sessionSecret).toBe(first.sessionSecret);
		expect(second.dataEncryptionKey).toBe(first.dataEncryptionKey);
	});

	it('gives independent stores independent secrets', async () => {
		const a = await initPersistedSecrets(createMemoryStores());
		const b = await initPersistedSecrets(createMemoryStores());

		expect(a.sessionSecret).not.toBe(b.sessionSecret);
		expect(a.dataEncryptionKey).not.toBe(b.dataEncryptionKey);
	});
});
