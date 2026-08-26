import { registerAnthropic } from './anthropic';

/**
 * Registers every model/auth provider the app uses. Called once from `app.ts`
 * at startup — provider setup lives here in `src/providers/`, not inline in the
 * app or in agent modules.
 * @throws {Error} If an `anthropic/*` model is configured but `ANTHROPIC_API_KEY`
 * is not set (propagated from `registerAnthropic`).
 */
export async function registerProviders(): Promise<void> {
	// Built-in Anthropic provider (credential-only; validated for fail-fast).
	registerAnthropic();
}
