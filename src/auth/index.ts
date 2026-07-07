import { config } from '../config';
import { getStores } from '../store';
import { parseKeyring } from './crypto';
import { createAuth, type Auth } from './routes';

/**
 * Memoized `Auth` singleton, shared by the app's HTTP routes (`app.ts`) and the
 * agent `route` handler (which needs `resolveUserToken`). Anchored on `globalThis`
 * so HMR re-evaluation reuses one instance (mirrors `getStores()` / the token cache).
 * @returns The shared `Auth` instance, creating and caching it on first call.
 * @throws {Error} If `config.dataEncryptionKey` is empty or malformed (via {@link parseKeyring}).
 */
export function getAuth(): Auth {
	const g = globalThis as Record<string, unknown>;
	const existing = g.__flueAuth as Auth | undefined;
	if (existing) return existing;

	const auth = createAuth({
		stores: getStores(),
		keyring: parseKeyring(config.dataEncryptionKey),
		sessionSecret: config.sessionSecret,
		sessionTtlSeconds: config.sessionTtlSeconds,
		secureCookies: config.zohoOAuthRedirectUri.startsWith('https://'),
		devAuth: config.devAuth,
		oauth: {
			clientId: config.zohoClientId,
			clientSecret: config.zohoClientSecret,
			redirectUri: config.zohoOAuthRedirectUri,
			loginScopes: config.zohoLoginScopes,
		},
	});
	g.__flueAuth = auth;
	return auth;
}
