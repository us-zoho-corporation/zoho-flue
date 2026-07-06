import { config } from '../config';
import { getZohoAccessToken } from '../auth/zoho-auth';
import { registerCatalystGLM } from './catalyst-glm';
import { registerAnthropic } from './anthropic';

const oauth = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
};

/**
 * Registers every model/auth provider the app uses. Called once from `app.ts`
 * at startup — provider setup lives here in `src/providers/`, not inline in the
 * app or in agent modules.
 */
export async function registerProviders(): Promise<void> {
	// Built-in Anthropic provider (credential-only; validated for fail-fast).
	registerAnthropic();

	// Custom Catalyst GLM provider — warm a Zoho access token now; the provider
	// refreshes it via oauth on a 401. contextWindow drives Flue's compaction.
	registerCatalystGLM({
		endpoint: config.catalystEndpoint,
		orgId: config.catalystOrgId,
		token: await getZohoAccessToken(oauth),
		oauth,
		contextWindow: config.catalystContextWindow,
		maxTokens: config.catalystMaxTokens,
	});
}
