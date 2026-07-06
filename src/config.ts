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
	},

	// Provider-models selectable in the chat. `spec` is a Flue model specifier
	// (`<provider>/<model>`); `key` is a URL-safe token carried in the conversation
	// id (`<key>__<uuid>`) so a single `assistant` agent can resolve the chosen
	// model per conversation. The default is `defaultChatModelKey`.
	chatModels: [
		{ key: 'claude', label: 'Claude Sonnet 5', spec: 'anthropic/claude-sonnet-5' },
		{ key: 'glm', label: 'Zoho GLM 4.7 Flash', spec: 'catalyst-glm/crm-di-glm47b_30b_it' },
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
