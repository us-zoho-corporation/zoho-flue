import { createProvider } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { setProvider } from '@flue/runtime';
import { config } from '../config';

/**
 * Anthropic is one of Flue's built-in catalog providers — reachable with only
 * `ANTHROPIC_API_KEY` in the environment. We still register it explicitly here
 * (the declared home for provider setup — see `src/providers/index.ts`), so its
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
	// Re-registers the built-in `anthropic` id, reusing its catalog models (cost,
	// context-window, wire protocol) unchanged, but resolving the key from
	// `config` rather than Pi's own `ANTHROPIC_API_KEY` env lookup.
	setProvider(createProvider({
		id: 'anthropic',
		auth: {
			apiKey: {
				name: 'Anthropic',
				resolve: async () => ({ auth: { apiKey: config.anthropicApiKey } }),
			},
		},
		models: anthropicProvider().getModels(),
		api: anthropicMessagesApi(),
	}));
}
