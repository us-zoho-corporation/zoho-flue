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
	// com.au | com.cn | jp — see https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html).
	// Used as the fallback accounts domain for /api/photo when a user's own
	// stored connection predates capturing it (see StoredToken.accountsServer) —
	// zoho_api itself runs as the logged-in user, not this service account (see
	// ZohoApiDeps in tools/zoho-api.ts). Per-user connections carry their own DC,
	// captured at consent time.
	zohoAccountsBase: `https://accounts.zoho.${process.env['ZOHO_DOMAIN_SUFFIX'] ?? 'com'}`,
	catalystOrgId: required('CATALYST_ORG_ID'),

	// Per-user Zoho OAuth login (authorization-code flow). Scopes may be comma- or
	// space-separated; granted scopes are stored per user and can be expanded.
	// Profile for identity, and ZohoCRM.org.READ so the top-bar profile popup can
	// show the user's Zoho CRM organization name right after login, without
	// requiring a separate "Connect CRM" step first.
	zohoOAuthRedirectUri: required('ZOHO_OAUTH_REDIRECT_URI'),
	zohoLoginScopes: process.env['ZOHO_LOGIN_SCOPES'] ?? 'AaaServer.profile.READ,ZohoCRM.org.READ',
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
				'ZohoCRM.settings.blueprint.ALL',
				'ZohoCRM.settings.workflow_rules.ALL',
				'ZohoCRM.settings.automation_actions.ALL',
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

	// Docs knowledge-base MCP server (help-docs.zoho-forge.com) — it runs its OWN
	// OAuth 2.1 authorization server (PKCE required), entirely separate from
	// accounts.zoho.com, discoverable at its /.well-known/oauth-authorization-server.
	// client id/secret come from a one-time dynamic client registration (RFC 7591)
	// against its /register endpoint. Optional: an empty client id disables the
	// knowledge-base tools/connection entirely (see src/mcp/zoho-kb.ts, mcp/builtins.ts).
	docsOauthClientId: process.env['DOCS_OAUTH_CLIENT_ID'] ?? '',
	docsOauthClientSecret: process.env['DOCS_OAUTH_CLIENT_SECRET'] ?? '',
	docsOauthAuthorizeUrl: 'https://help-docs.zoho-forge.com/authorize',
	docsOauthTokenUrl: 'https://help-docs.zoho-forge.com/token',
	docsOauthRedirectUri: process.env['DOCS_OAUTH_REDIRECT_URI'] ?? '',
	docsOauthScopes: 'openid profile email',
	zohoDocsMcpUrl: process.env['ZOHO_DOCS_ENDPOINT'] ?? 'https://help-docs.zoho-forge.com/mcp',

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
	// `attachmentMimeTypes` gates the composer's attachment button — Flue's direct-
	// prompt `images` field only accepts vision-capable models, and image support
	// varies per model/provider, so this is a real capability check, not cosmetic.
	// An empty list disables the button with an explanatory popover instead of
	// letting the user attach something the model can't read.
	// The default is `defaultChatModelKey`.
	chatModels: [
		{
			key: 'claude', label: 'Claude Sonnet 5', spec: 'anthropic/claude-sonnet-5', requiresAuth: false,
			attachmentMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
		},
	] as const,
	defaultChatModelKey: 'claude',

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
	// Maximum characters of a zoho_api response body returned to the model.
	// A single unbounded response (e.g. a bulk records list with no `fields`/
	// `per_page` narrowing) can be hundreds of thousands of tokens — large
	// enough to jump straight past the model's remaining context budget in one
	// tool call, before Flue's automatic compaction (which reacts between
	// turns, not mid-response) gets a chance to react. Observed live: a
	// conversation failed outright with "prompt is too long: 1049417 tokens >
	// 1000000 maximum" from a single such response. Truncating here, with a
	// clear note, keeps any one call bounded and nudges the model to narrow
	// its request instead of assuming it saw the whole thing.
	zohoApiMaxResponseChars: 100_000,

};
