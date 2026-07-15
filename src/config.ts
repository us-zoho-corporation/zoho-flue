/**
 * Reads an environment variable, throwing at startup if it is absent.
 * @param key - Name of the environment variable to read.
 * @returns The variable's string value.
 * @throws {Error} If the environment variable is not set (or is an empty string).
 */
function required(key: string): string {
	const val = process.env[key];
	if (!val) throw new Error(`Missing required environment variable: ${key}`);
	return val;
}

/** A Zoho product the settings UI can request incremental OAuth scopes for. */
export interface ZohoProduct {
	key: string;
	label: string;
	description: string;
	scopes: string[];
}

export const config = {
	// OAuth + Catalyst — read from environment at startup
	zohoClientId: required('ZOHO_OAUTH_CLIENT_ID'),
	zohoClientSecret: required('ZOHO_OAUTH_CLIENT_SECRET'),
	zohoRefreshToken: required('ZOHO_OAUTH_REFRESH_TOKEN'),
	// Data-center domain suffix for the shared service account (com | eu | in |
	// com.au | com.cn | jp — see https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html),
	// used only for the Catalyst GLM warm token (providers/index.ts) — zoho_api
	// itself runs as the logged-in user, not this service account (see
	// ZohoApiDeps in tools/zoho-api.ts). A refresh token only works against the
	// SAME data center it was issued from; using the wrong one fails with
	// "invalid_code" no matter how valid the token otherwise is. Per-user
	// connections instead carry their own DC, captured at consent time (see
	// StoredToken.accountsServer).
	zohoAccountsBase: `https://accounts.zoho.${process.env['ZOHO_DOMAIN_SUFFIX'] ?? 'com'}`,
	catalystEndpoint: required('CATALYST_ENDPOINT'),
	catalystOrgId: required('CATALYST_ORG_ID'),

	// Per-user Zoho OAuth login (authorization-code flow). Scopes may be comma- or
	// space-separated; granted scopes are stored per user and can be expanded.
	// Profile for identity, QuickML.deployment.READ so the user's token can reach
	// the Catalyst GLM (Zoho GLM 4.7 Flash) endpoint, and ZohoCRM.org.READ so the
	// top-bar profile popup can show the user's Zoho CRM organization name right
	// after login, without requiring a separate "Connect CRM" step first.
	zohoOAuthRedirectUri: required('ZOHO_OAUTH_REDIRECT_URI'),
	zohoLoginScopes: process.env['ZOHO_LOGIN_SCOPES'] ?? 'AaaServer.profile.READ,QuickML.deployment.READ,ZohoCRM.org.READ',
	// Per-product scope bundles the settings "Connections" panel offers, so a user
	// can grant a product's full scope set in one incremental-authorization round
	// trip (`GET /api/auth/login?scopes=...`) instead of hitting reauth errors
	// piecemeal as different tools need different scopes. Kept in sync with the
	// `## Scopes` sections of src/skills/zoho-crm-*/zoho-desk-*.
	zohoProducts: [
		{
			key: 'crm',
			label: 'Zoho CRM',
			description: 'Modules, records, search, bulk operations, and org/user lookups.',
			scopes: [
				'ZohoCRM.modules.ALL',
				'ZohoCRM.settings.ALL',
				'ZohoCRM.bulk.ALL',
				'ZohoCRM.notifications.ALL',
				'ZohoCRM.coql.READ',
				'ZohoCRM.users.READ',
				'ZohoCRM.org.READ',
			],
		},
		{
			key: 'desk',
			label: 'Zoho Desk',
			description: 'Tickets, contacts, accounts, agents, and departments.',
			scopes: [
				'Desk.basic.READ',
				'Desk.search.READ',
				'Desk.settings.READ',
				'Desk.contacts.READ',
				'Desk.tickets.READ',
				'Desk.tickets.UPDATE',
			],
		},
	] satisfies ZohoProduct[],
	// HMAC secret for signed session/login cookies. Not an env var — loaded (and,
	// on first boot, generated) from the durable secrets store by
	// `initPersistedSecrets()`, which app.ts awaits before anything reads this.
	// Placeholder until then; never used un-resolved.
	sessionSecret: '',
	// Session lifetime; default 2 hours. Sliding (idle) timeout — each throttled
	// touch re-extends it — so it doubles as the Cache entry TTL for the
	// Cache-backed session store (well within Cache's 48h cap).
	sessionTtlSeconds: Number(process.env['SESSION_TTL_SECONDS'] ?? 60 * 60 * 2),
	// AES-256-GCM keyring for encrypting refresh tokens at rest. Not an env var —
	// loaded/generated the same way as sessionSecret above. Parsed by src/auth/crypto.ts.
	dataEncryptionKey: '',

	// Catalyst Data Store (REST persistence for users/tokens/sessions/preferences).
	// Reached with the service-account admin token (same creds as the GLM provider).
	catalystProjectId: required('CATALYST_PROJECT_ID'),
	catalystEnvironment: process.env['CATALYST_ENVIRONMENT'] ?? 'Development',
	catalystApiBaseUrl: process.env['CATALYST_API_BASE_URL'] ?? 'https://api.catalyst.zoho.com/baas/v1',
	// Numeric Cache segment id backing the session store (console-created, or the
	// project's default segment). Sessions are short-lived (see sessionTtlSeconds),
	// so Cache — not NoSQL — is their home.
	catalystCacheSegment: process.env['CATALYST_CACHE_SEGMENT'] ?? '',
	// Stratus bucket (globally-unique name) for Flue attachment bytes, and the
	// bucket's object host — copy the exact URL from the Catalyst console (the
	// Development env appends `-development`). Both required only when the Flue
	// persistence adapter runs (STORE_BACKEND=catalyst); empty is fine for dev.
	catalystStratusBucket: process.env['CATALYST_STRATUS_BUCKET'] ?? '',
	catalystStratusObjectBaseUrl: process.env['CATALYST_STRATUS_OBJECT_URL'] ?? '',
	// Which store implementation to use: 'catalyst' (Data Store) or 'memory' (dev/tests).
	storeBackend: (process.env['STORE_BACKEND'] ?? 'catalyst') as 'catalyst' | 'memory',
	// Deployment environment. Only 'local' and 'CI' enable the dev-login bypass below.
	env: process.env['ENV'] ?? '',
	// Local/CI ONLY: enables /api/auth/dev-login to mint a session for a fake user
	// without Zoho OAuth (for local testing / the e2e-chat harness). Never in prod.
	devAuth: process.env['ENV'] === 'local' || process.env['ENV'] === 'CI',

	zohoDocsBearerToken: process.env['ZOHO_DOCS_BEARER_TOKEN'] ?? '',

	// Anthropic is a built-in Flue provider — only its key is needed. Optional here;
	// enforced at startup by registerAnthropic() when an anthropic/* model is offered.
	anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',

	// Shared secret for API routes. If unset, routes are unauthenticated — only safe in dev.
	apiSecret: process.env['FLUE_API_SECRET'] ?? '',

	// Origins allowed for CORS (comma-separated). Set FLUE_CORS_ORIGINS in production.
	corsOrigins: (process.env['FLUE_CORS_ORIGINS'] ?? 'http://localhost:5173,http://localhost:4173')
		.split(',').map(s => s.trim()).filter(Boolean),

	// Warn at startup if security-sensitive defaults are in use.
	_devWarnings: {
		noApiSecret: !process.env['FLUE_API_SECRET'],
		defaultCorsOrigins: !process.env['FLUE_CORS_ORIGINS'],
		usingMemoryStore: (process.env['STORE_BACKEND'] ?? 'catalyst') === 'memory',
		devAuth: process.env['ENV'] === 'local' || process.env['ENV'] === 'CI',
	},

	// Provider-models selectable in the chat. `spec` is a Flue model specifier
	// (`<provider>/<model>`); `key` is a URL-safe token carried in the conversation
	// id (`<key>__<uuid>`) so a single `assistant` agent can resolve the chosen
	// model per conversation. `requiresAuth` marks models that run as the logged-in
	// user (their token must carry the needed scope), so the chat can prompt sign-in.
	// The default is `defaultChatModelKey`.
	chatModels: [
		{ key: 'claude', label: 'Claude Sonnet 5', spec: 'anthropic/claude-sonnet-5', requiresAuth: false },
		{ key: 'glm', label: 'Zoho GLM 4.7 Flash', spec: 'catalyst-glm/crm-di-glm47b_30b_it', requiresAuth: true },
	] as const,
	defaultChatModelKey: 'claude',
	// Catalyst GLM input context window (tokens). Drives Flue's built-in compaction.
	catalystContextWindow: 200_000,
	// Max output tokens per turn. The default of 2048 truncates turns that both
	// emit a visualization spec (a large tool-call JSON) and a written answer,
	// which surfaces as the reply cutting off mid-stream. 8192 leaves headroom.
	catalystMaxTokens: 8_192,

	// Zoho API tool — domains the zoho_api tool is permitted to reach. zoho_api
	// runs as whichever user is logged in (see ZohoApiDeps in tools/zoho-api.ts),
	// and different users can each be in a different Zoho data center — so this
	// is every known DC's domain, not just the one zohoAccountsBase points the
	// shared service account at. Still a fixed, fully-enumerated allowlist of
	// real Zoho domains, so this doesn't weaken the SSRF guard at all.
	zohoAllowedHostnames: (['com', 'eu', 'in', 'com.au', 'com.cn', 'jp'] as const)
		.flatMap((suffix) => [`zoho.${suffix}`, `zohoapis.${suffix}`]),
	// Maximum number of redirects the zoho_api tool will follow
	zohoApiMaxRedirects: 5,

};
