import { registerApiProvider, registerProvider } from '@flue/runtime';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai';
import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../auth/zoho-auth';
import type {
	Api,
	AssistantMessage,
	Context,
	ImageContent,
	Model,
	SimpleStreamOptions,
	StreamOptions,
	TextContent,
	ToolCall,
} from '@earendil-works/pi-ai';

export const CATALYST_GLM_API = 'catalyst-glm' as const;

type ProviderCredentials = { token: string; oauth: OAuthCredentials | null };
const _credentials = new Map<string, ProviderCredentials>();

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

/** Creates a zeroed AssistantMessage skeleton that the stream mutates as events arrive. */
function makeOutput(model: Model<Api>): AssistantMessage {
	return {
		role: 'assistant',
		content: [],
		api: model.api as Api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: ZERO_COST,
		},
		stopReason: 'stop',
		timestamp: Date.now(),
	} as never;
}

type CatalystMessage = { role: string; content: string };

/** Flattens content blocks to a plain string; image blocks become `[image]`. */
export function blocksToText(blocks: (TextContent | ImageContent)[]): string {
	return blocks.map(c => (c.type === 'text' ? c.text : '[image]')).join('');
}


/**
 * Converts a Flue Context into Catalyst's message array.
 *
 * Catalyst GLM only accepts `{ role, content }` and rejects `tool_calls`,
 * `tool_call_id`, and `role: "tool"` with EXTRA_KEY_FOUND_IN_JSON. So assistant
 * tool calls are dropped (text kept) and tool results are folded into a user
 * message with explicit delimiters the model can recognise. Context size is
 * managed by Flue's built-in compaction via the provider's `contextWindow`.
 */
export function convertMessages(context: Context): CatalystMessage[] {
	const messages: CatalystMessage[] = [];
	if (context.systemPrompt) messages.push({ role: 'system', content: context.systemPrompt });

	for (const msg of context.messages) {
		if (msg.role === 'user') {
			messages.push({
				role: 'user',
				content: typeof msg.content === 'string' ? msg.content : blocksToText(msg.content),
			});
		} else if (msg.role === 'assistant') {
			// Send only the model's own text back. Catalyst rejects native tool_calls,
			// and echoing a synthetic "[tool_call …]" line into history teaches the
			// model to emit tool calls as prose instead of real calls. The paired
			// tool-result message (below) names the tool, which is the coherence signal
			// the model needs to correlate its action with the result.
			const text = (msg.content as ReadonlyArray<{ type: string; text?: string }>)
				.filter(c => c.type === 'text')
				.map(c => c.text ?? '')
				.join('');
			messages.push({ role: 'assistant', content: text });
		} else if (msg.role === 'toolResult') {
			// Name the tool that produced the result so the model can correlate it with
			// its own call, and neutralize any forged delimiter tokens in the (model- or
			// web-sourced) content so it can't fake a tool boundary.
			const body = blocksToText(msg.content).replace(/\[TOOL_RESULT_(START|END)\b/gi, '[tool_result_$1');
			const tool = msg.toolName ? ` tool="${msg.toolName}"` : '';
			messages.push({
				role: 'user',
				content: `[TOOL_RESULT_START${tool} id="${msg.toolCallId}"]\n${body}\n[TOOL_RESULT_END]`,
			});
		}
	}

	return messages;
}

/** Converts Flue tool definitions to Catalyst's function-calling format. */
export function convertTools(tools?: Context['tools']) {
	return tools?.map((t) => ({
		type: 'function' as const,
		function: { name: t.name, description: t.description, parameters: t.parameters },
	}));
}

/** Flue StreamFunction implementation for Catalyst GLM; retries once on 401 with a refreshed token. */
function catalystStream(
	model: Model<Api>,
	context: Context,
	options?: StreamOptions | SimpleStreamOptions,
): InstanceType<typeof AssistantMessageEventStream> {
	const eventStream = new AssistantMessageEventStream();
	const output = makeOutput(model);

	eventStream.push({ type: 'start', partial: output });

	const tools = convertTools(context.tools);

	(async () => {
		const creds = _credentials.get(model.provider);
		if (!creds) throw new Error(`No credentials registered for provider '${model.provider}'`);

		const body = JSON.stringify({
			model: model.id,
			messages: convertMessages(context),
			max_tokens: model.maxTokens ?? 2048,
			stream: false,
			...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
		});

		const doFetch = (tok: string) => fetch(model.baseUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...model.headers, Authorization: `Bearer ${tok}` },
			body,
			signal: options?.signal,
		});

		let res = await doFetch(creds.token);

		if (res.status === 401 && creds.oauth) {
			evictZohoToken(creds.oauth);
			const refreshed = await getZohoAccessToken(creds.oauth);
			creds.token = refreshed;
			res = await doFetch(refreshed);
		}

		if (!res.ok) {
			// Log full error server-side; surface only the status to the client.
			const errBody = await res.text().catch(() => res.statusText);
			console.error(`[catalyst-glm] provider error ${res.status}:`, errBody);
			output.stopReason = 'error';
			(output as never as { errorMessage: string }).errorMessage = `LLM request failed (${res.status})`;
			eventStream.push({ type: 'error', reason: 'error', error: output });
			return;
		}

		type CatalystToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
		type CatalystResponse = {
			response?: string;
			tool_calls?: CatalystToolCall[];
			usage?: { prompt_tokens: number; completion_tokens: number };
		};

		const data = (await res.json()) as CatalystResponse;

		let contentIndex = 0;

		if (data.response) {
			const textBlock = { type: 'text' as const, text: data.response };
			(output.content as TextContent[]).push(textBlock);
			eventStream.push({ type: 'text_start', contentIndex, partial: output });
			eventStream.push({ type: 'text_delta', contentIndex, delta: data.response, partial: output });
			eventStream.push({ type: 'text_end', contentIndex, content: data.response, partial: output });
			contentIndex++;
		}

		if (data.tool_calls?.length) {
			output.stopReason = 'toolUse';
			for (const tc of data.tool_calls) {
				let parsedArgs: Record<string, unknown> = {};
				try {
					const raw: unknown = JSON.parse(tc.function.arguments);
					if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
						parsedArgs = raw as Record<string, unknown>;
					}
				} catch {
					// Malformed or truncated arguments (e.g. a large spec cut off by
					// max_tokens). Don't abort the turn: emit the call with empty args so
					// the tool's schema validation returns a recoverable error the model
					// can react to, rather than killing the whole response.
					parsedArgs = {};
				}
				const toolCall: ToolCall = {
					type: 'toolCall',
					id: tc.id,
					name: tc.function.name,
					arguments: parsedArgs,
				};
				(output.content as (TextContent | ToolCall)[]).push(toolCall);
				eventStream.push({ type: 'toolcall_start', contentIndex, partial: output });
				eventStream.push({ type: 'toolcall_end', contentIndex, toolCall, partial: output });
				contentIndex++;
			}
		} else {
			output.stopReason = 'stop';
		}

		if (data.usage) {
			output.usage = {
				input: data.usage.prompt_tokens,
				output: data.usage.completion_tokens,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
				cost: ZERO_COST,
			} as never;
		}

		eventStream.push({
			type: 'done',
			reason: output.stopReason as 'stop' | 'length' | 'toolUse',
			message: output,
		});
	})().catch((err: unknown) => {
		output.stopReason = 'error';
		(output as never as { errorMessage: string }).errorMessage = String(err);
		eventStream.push({ type: 'error', reason: 'error', error: output });
	});

	return eventStream;
}

registerApiProvider({
	api: CATALYST_GLM_API,
	stream: catalystStream,
	streamSimple: catalystStream,
});

export interface RegisterCatalystGLMOptions {
	endpoint: string;
	orgId: string;
	token: string;
	oauth?: OAuthCredentials;
	providerId?: string;
	maxTokens?: number;
	/** Input context window in tokens. Lets Flue's built-in compaction trigger correctly. */
	contextWindow?: number;
}

/** Registers the Catalyst GLM API provider with Flue and stores credentials for token refresh. */
export function registerCatalystGLM({
	endpoint,
	orgId,
	token,
	oauth,
	providerId = 'catalyst-glm',
	maxTokens = 2048,
	contextWindow,
}: RegisterCatalystGLMOptions): void {
	_credentials.set(providerId, { token, oauth: oauth ?? null });
	registerProvider(providerId, {
		api: CATALYST_GLM_API,
		baseUrl: endpoint,
		headers: { 'CATALYST-ORG': orgId },
		maxTokens,
		...(contextWindow ? { contextWindow } : {}),
	});
}
