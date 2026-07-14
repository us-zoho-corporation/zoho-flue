import { config } from '../config';
import { getZohoAccessToken } from '../auth/zoho-auth';
import { registerCatalystGLM } from './catalyst-glm';
import { registerAnthropic } from './anthropic';

const oauth = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
	accountsBase: config.zohoAccountsBase,
};

/**
 * Registers every model/auth provider the app uses. Called once from `app.ts`
 * at startup — provider setup lives here in `src/providers/`, not inline in the
 * app or in agent modules.
 * @throws {Error} If an `anthropic/*` model is configured but `ANTHROPIC_API_KEY`
 * is not set (propagated from `registerAnthropic`). Failure to warm the Catalyst
 * GLM token is handled internally and does not throw.
 */
export async function registerProviders(): Promise<void> {
	// Built-in Anthropic provider (credential-only; validated for fail-fast).
	registerAnthropic();

	// Custom Catalyst GLM provider. Warming the Zoho access token now is an
	// optimization — the provider refreshes via oauth on a 401 anyway — so a
	// failure here (e.g. a stale service-account refresh token) must NOT crash
	// startup: it would take down the whole server, including per-user login,
	// which does not depend on this token. Register with whatever we can warm.
	let token = '';
	try {
		token = await getZohoAccessToken(oauth);
	} catch (err) {
		console.warn(`[providers] Could not warm the Catalyst GLM token at startup — the Zoho GLM model will error until the service-account ZOHO_OAUTH_REFRESH_TOKEN is valid for the current client. (${String(err)})`);
	}
	registerCatalystGLM({
		endpoint: config.catalystEndpoint,
		orgId: config.catalystOrgId,
		token,
		oauth,
		contextWindow: config.catalystContextWindow,
		maxTokens: config.catalystMaxTokens,
	});
}
