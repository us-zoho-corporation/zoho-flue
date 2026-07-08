import { randomBytes } from 'node:crypto';
import type { Stores } from '../store/types';

const SESSION_SECRET_KEY = 'SESSION_SECRET';
const DATA_ENCRYPTION_KEY_KEY = 'DATA_ENCRYPTION_KEY';
const BOOTSTRAP_KEY_ID = 'k1';

export interface PersistedSecrets {
	sessionSecret: string;
	dataEncryptionKey: string;
}

/**
 * Loads the app's durable secrets from `stores.secrets`, generating and
 * persisting them on the very first boot. Every subsequent boot (including
 * after an AppSail redeploy, restart, or a second instance) reads back the
 * same values instead of minting new ones — see `SecretsStore.createIfAbsent`
 * for how concurrent first-boot races converge on one winner.
 * @param stores - The app's `Stores`; only `stores.secrets` is used.
 * @returns The resolved session-cookie secret and refresh-token encryption keyring,
 * ready to assign onto `config.sessionSecret` / `config.dataEncryptionKey`.
 * @throws {Error} If the underlying store read/write fails.
 */
export async function initPersistedSecrets(stores: Stores): Promise<PersistedSecrets> {
	const sessionSecret = await stores.secrets.createIfAbsent(
		SESSION_SECRET_KEY,
		randomBytes(32).toString('base64'),
	);
	const dataEncryptionKey = await stores.secrets.createIfAbsent(
		DATA_ENCRYPTION_KEY_KEY,
		`${BOOTSTRAP_KEY_ID}:${randomBytes(32).toString('base64')}`,
	);
	return { sessionSecret, dataEncryptionKey };
}
