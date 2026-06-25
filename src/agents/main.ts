import { defineAgent, type AgentRouteHandler } from '@flue/runtime';
import { config } from '../config';
import { defineZohoApiTool } from '../tools/zoho-api';
import { zohoKbTools } from '../mcp/zoho-kb';

// Tools hold these credentials in a closure; the model only ever sees parameter names.
const oauth = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
};

export const route: AgentRouteHandler = async (_c, next) => next();

export default defineAgent(() => ({
	model: config.model,
	tools: [defineZohoApiTool(oauth), ...(config.zohoDocsBearerToken ? zohoKbTools : [])],
	instructions:
		'You are a Zoho product assistant. For questions about Zoho products (features, '
		+ 'configuration, APIs, troubleshooting), use zoho_kb_search to find the relevant '
		+ 'documentation, then answer the user directly and concisely from what you found. '
		+ 'Refine and search again only if the first results fall short, and use '
		+ 'zoho_kb_get_page when you need an article’s full text. Always ground your answer '
		+ 'in the documentation and cite the source URLs.',
}));
