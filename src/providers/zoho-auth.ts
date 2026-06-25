import { createHash } from 'node:crypto';

export type OAuthCredentials = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
};

// Zoho access tokens live for 1 hour. Refresh 5 minutes early to absorb clock skew.
const SKEW_MS = 5 * 60 * 1000;

type CacheEntry = {
	token: string;
	expiresAt: number;
	// Deduplicate concurrent refresh calls: store the in-flight promise.
	inflight?: Promise<string>;
};

// Anchored to globalThis so HMR module re-evaluation doesn't reset the cache.
const cache: Map<string, CacheEntry> = (
  (globalThis as Record<string, unknown>).__zohoTokenCache as Map<string, CacheEntry> | undefined
) ?? (() => {
  const m = new Map<string, CacheEntry>();
  (globalThis as Record<string, unknown>).__zohoTokenCache = m;
  return m;
})();

function cacheKey(opts: OAuthCredentials): string {
	const tokenHash = createHash('sha256').update(opts.refreshToken).digest('hex').slice(0, 16);
	return `${opts.clientId}:${tokenHash}`;
}

async function fetchToken(opts: OAuthCredentials): Promise<{ token: string; expiresAt: number }> {
	const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: opts.clientId,
			client_secret: opts.clientSecret,
			refresh_token: opts.refreshToken,
		}),
	});
	if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status}`);

	const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
	if (data.error || !data.access_token) throw new Error(`Zoho token refresh error: ${data.error}`);

	// Zoho returns expires_in in seconds (typically 3600). Fall back to 1 hour if absent.
	const lifetimeMs = (data.expires_in ?? 3600) * 1000;
	return { token: data.access_token, expiresAt: Date.now() + lifetimeMs };
}

/**
 * Returns a valid Zoho access token, refreshing only when the cached one is
 * within SKEW_MS of expiry. Concurrent callers share a single in-flight request.
 */
export async function getZohoAccessToken(opts: OAuthCredentials): Promise<string> {
	const key = cacheKey(opts);
	const entry = cache.get(key);

	if (entry) {
		// Serve from cache if still fresh.
		if (Date.now() < entry.expiresAt - SKEW_MS) return entry.token;

		// Deduplicate: join the in-flight refresh if one is already running.
		if (entry.inflight) return entry.inflight;
	}

	// Start a new refresh, storing the promise so concurrent callers can join it.
	const placeholder: CacheEntry = { token: entry?.token ?? '', expiresAt: 0 };
	placeholder.inflight = fetchToken(opts).then(({ token, expiresAt }) => {
		cache.set(key, { token, expiresAt });
		return token;
	}).catch((err) => {
		// On failure, clear inflight so next call retries, but keep any existing token.
		const current = cache.get(key);
		if (current) current.inflight = undefined;
		else cache.delete(key);
		throw err;
	});

	cache.set(key, placeholder);
	return placeholder.inflight;
}

/** Evicts the cached token for the given credentials (e.g. after a definitive 401). */
export function evictZohoToken(opts: OAuthCredentials): void {
	cache.delete(cacheKey(opts));
}
