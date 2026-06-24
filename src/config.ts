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

	// Model used by all agents
	model: 'catalyst-glm/crm-di-glm47b_30b_it',

	// Zoho API tool — domains the zoho_api tool is permitted to reach
	zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
	// Maximum number of redirects the zoho_api tool will follow
	zohoApiMaxRedirects: 5,

};
