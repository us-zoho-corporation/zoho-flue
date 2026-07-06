/** Reads an environment variable, throwing at startup if it is absent. */
function required(key: string): string {
	const val = process.env[key];
	if (!val) throw new Error(`Missing required environment variable: ${key}`);
	return val;
}

export const config = {
	// OAuth + Catalyst — read from environment at startup
	zohoClientId: required('ZOHO_OAUTH_CLIENT_ID'),
	zohoClientSecret: required('ZOHO_OAUTH_CLIENT_SECRET'),
	zohoRefreshToken: required('ZOHO_OAUTH_REFRESH_TOKEN'),
	catalystEndpoint: required('CATALYST_ENDPOINT'),
	catalystOrgId: required('CATALYST_ORG_ID'),

	// Per-user Zoho OAuth login (authorization-code flow). Scopes may be comma- or
	// space-separated; granted scopes are stored per user and can be expanded.
	// Profile for identity, plus QuickML.deployment.READ so the user's token can
	// reach the Catalyst GLM (Zoho GLM 4.7 Flash) endpoint.
	zohoOAuthRedirectUri: required('ZOHO_OAUTH_REDIRECT_URI'),
	zohoLoginScopes: process.env['ZOHO_LOGIN_SCOPES'] ?? 'AaaServer.profile.READ,QuickML.deployment.READ',
	// HMAC secret for signed session/login cookies (≥32 bytes recommended).
	sessionSecret: required('SESSION_SECRET'),
	// Session lifetime; default 30 days.
	sessionTtlSeconds: Number(process.env['SESSION_TTL_SECONDS'] ?? 60 * 60 * 24 * 30),
	// AES-256-GCM key(s) for encrypting stored refresh tokens at rest. Raw form is
	// `keyId:base64(32B)`, comma-separated (first = active for new writes; all usable
	// for decryption to support rotation). Parsed by src/auth/crypto.ts.
	dataEncryptionKey: required('DATA_ENCRYPTION_KEY'),

	// Catalyst Data Store (REST persistence for users/tokens/sessions/preferences).
	// Reached with the service-account admin token (same creds as the GLM provider).
	catalystProjectId: required('CATALYST_PROJECT_ID'),
	catalystEnvironment: process.env['CATALYST_ENVIRONMENT'] ?? 'Development',
	catalystApiBaseUrl: process.env['CATALYST_API_BASE_URL'] ?? 'https://api.catalyst.zoho.com/baas/v1',
	// Which store implementation to use: 'catalyst' (Data Store) or 'memory' (dev/tests).
	storeBackend: (process.env['STORE_BACKEND'] ?? 'catalyst') as 'catalyst' | 'memory',
	// Max external MCP servers a single user may connect.
	mcpMaxServersPerUser: Number(process.env['MCP_MAX_SERVERS_PER_USER'] ?? 20),

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

	// Zoho API tool — domains the zoho_api tool is permitted to reach
	zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
	// Maximum number of redirects the zoho_api tool will follow
	zohoApiMaxRedirects: 5,

};
