import { registerProvider } from '@flue/runtime';
import { config } from '../config';

/**
 * Anthropic is one of Flue's built-in catalog providers — reachable with only
 * `ANTHROPIC_API_KEY` in the environment. We still register it explicitly here,
 * the declared home for the provider (mirroring `catalyst-glm.ts`), so its
 * credential is wired from `config` rather than an implicit env lookup, and so
 * startup fails fast when an `anthropic/*` model is offered without a key.
 * @throws {Error} If an `anthropic/*` model is configured in `config.chatModels`
 * but `ANTHROPIC_API_KEY` is not set.
 */
export function registerAnthropic(): void {
	const usesAnthropic = config.chatModels.some((m) => m.spec.startsWith('anthropic/'));
	if (!usesAnthropic) return;
	if (!config.anthropicApiKey) {
		throw new Error(
			'ANTHROPIC_API_KEY is not set, but an anthropic/* model is offered in config.chatModels. '
			+ 'Set it in .env or remove the anthropic model.',
		);
	}
	// Layers our key onto the catalog `anthropic` provider (keeps its model catalog,
	// cost, context-window, and wire protocol); no baseUrl/api override needed.
	registerProvider('anthropic', { apiKey: config.anthropicApiKey });
}
