import { defineAgent } from '@flue/runtime';
import { config } from '../config';
import { registerCatalystGLM } from '../providers/catalyst-glm';
import { defineZohoApiTool } from '../tools/zoho-api';
import { getZohoAccessToken } from '../providers/zoho-auth';

const oauth = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
};

const token = await getZohoAccessToken(oauth);

registerCatalystGLM({
	endpoint: config.catalystEndpoint,
	orgId: config.catalystOrgId,
	token,
	oauth,
});

export default defineAgent(() => ({
	model: config.model,
	tools: [defineZohoApiTool(token)],
	instructions:
		'You are a Zoho assistant. Use the zoho_api tool to make authenticated API requests and bash for data processing and orchestration.',
}));
