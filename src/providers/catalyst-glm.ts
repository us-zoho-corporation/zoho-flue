import { registerApiProvider, registerProvider } from '@flue/runtime';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai';
import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../auth/zoho-auth';
import { currentUserToken } from '../auth/request-context';
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

/**
 * Creates a zeroed AssistantMessage skeleton that the stream mutates as events arrive.
 * @param model - The Flue model the assistant message is being produced for.
 * @returns A fresh `AssistantMessage` with empty content, zeroed usage/cost, and `stopReason: 'stop'`.
 */
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

/**
 * Flattens content blocks to a plain string; image blocks become `[image]`.
 * @param blocks - Ordered text/image content blocks to flatten.
 * @returns The concatenated text, with each image block replaced by the literal `[image]`.
 */
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
 * @param context - The Flue conversation context (system prompt + message history) to convert.
 * @returns The equivalent Catalyst `{ role, content }` message array.
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

/**
 * Converts Flue tool definitions to Catalyst's function-calling format.
 * @param tools - Flue tool definitions from the conversation context, if any.
 * @returns The tools mapped to Catalyst's `{ type: 'function', function: {...} }` shape,
 * or `undefined` if `tools` is `undefined`.
 */
export function convertTools(tools?: Context['tools']) {
	return tools?.map((t) => ({
		type: 'function' as const,
		function: { name: t.name, description: t.description, parameters: t.parameters },
	}));
}

/**
 * Flue StreamFunction implementation for Catalyst GLM; retries once on 401 with a refreshed token.
 * @param model - The resolved Flue model, including its `baseUrl`, `headers`, and `provider` id.
 * @param context - The Flue conversation context to send to Catalyst.
 * @param options - Optional stream options; only `signal` (for abort) is used.
 * @returns An `AssistantMessageEventStream` that emits `start`/`text_*`/`toolcall_*`/`done`/`error`
 * events as the (non-streamed) Catalyst response is translated into Flue's streaming event shape.
 * Request failures are reported via an `error` event on the stream rather than a thrown exception.
 */
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

		// Prefer the logged-in user's token (carries QuickML.deployment.READ) when the
		// request set one; otherwise fall back to the shared service-account token.
		const userToken = currentUserToken();

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

		let res = await doFetch(userToken ?? creds.token);

		// Only the service-account token can be refreshed here (via its oauth creds).
		// A per-user token was just resolved fresh, so a 401 on it surfaces as an error.
		if (res.status === 401 && !userToken && creds.oauth) {
			evictZohoToken(creds.oauth);
			const refreshed = await getZohoAccessToken(creds.oauth);
			creds.token = refreshed;
			res = await doFetch(refreshed);
		}

		if (!res.ok) {
			// Log full error server-side; surface a concise message to the client.
			const errBody = await res.text().catch(() => res.statusText);
			console.error(`[catalyst-glm] provider error ${res.status}:`, errBody);
			output.stopReason = 'error';
			const authFailed = res.status === 401 || res.status === 403;
			const message = authFailed
				? (userToken
					? 'Your Zoho session couldn’t authorize Zoho GLM 4.7 Flash. Please sign in again.'
					: 'Sign in with Zoho to use Zoho GLM 4.7 Flash.')
				: `LLM request failed (${res.status})`;
			(output as never as { errorMessage: string }).errorMessage = message;
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

/**
 * Registers the Catalyst GLM API provider with Flue and stores credentials for token refresh.
 * @param options.endpoint - The Catalyst QuickML deployment URL to send requests to.
 * @param options.orgId - Zoho Catalyst org id, sent as the `CATALYST-ORG` header.
 * @param options.token - Bearer token used for requests (service-account or warmed token).
 * @param options.oauth - OAuth credentials used to refresh `token` on a 401, if provided.
 * @param options.providerId - Flue provider id to register under; defaults to `'catalyst-glm'`.
 * @param options.maxTokens - Default max output tokens per request; defaults to `2048`.
 * @param options.contextWindow - Input context window in tokens, for Flue's built-in compaction.
 */
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
