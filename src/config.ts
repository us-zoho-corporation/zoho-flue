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

	zohoDocsToken: process.env['ZOHO_DOCS_TOKEN'] ?? '',

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

	// Model used by all agents
	model: 'catalyst-glm/crm-di-glm47b_30b_it',

	// Zoho API tool — domains the zoho_api tool is permitted to reach
	zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
	// Maximum number of redirects the zoho_api tool will follow
	zohoApiMaxRedirects: 5,

};
