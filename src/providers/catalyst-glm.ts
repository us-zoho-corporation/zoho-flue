import { registerApiProvider, registerProvider } from '@flue/runtime';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai';
import { getZohoAccessToken, type OAuthCredentials } from './zoho-auth';
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

let _token: string | null = null;
let _oauthCreds: OAuthCredentials | null = null;

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

type CatalystMessage = {
	role: string;
	content: string;
	tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
};

/** Flattens content blocks to a plain string; image blocks become `[image]`. */
export function blocksToText(blocks: (TextContent | ImageContent)[]): string {
	return blocks.map(c => (c.type === 'text' ? c.text : '[image]')).join('');
}

/** Converts a Flue Context into Catalyst's OpenAI-compatible message array. */
export function convertMessages(context: Context): CatalystMessage[] {
	const msgs: CatalystMessage[] = [];

	if (context.systemPrompt) {
		msgs.push({ role: 'system', content: context.systemPrompt });
	}

	for (const msg of context.messages) {
		if (msg.role === 'user') {
			msgs.push({
				role: 'user',
				content: typeof msg.content === 'string' ? msg.content : blocksToText(msg.content),
			});
		} else if (msg.role === 'assistant') {
			const text = msg.content
				.filter((c): c is TextContent => c.type === 'text')
				.map(c => c.text)
				.join('');
			const toolCalls = msg.content
				.filter((c): c is ToolCall => c.type === 'toolCall')
				.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }));
			msgs.push({
				role: 'assistant',
				content: text,
				...(toolCalls.length ? { tool_calls: toolCalls } : {}),
			});
		} else if (msg.role === 'toolResult') {
			msgs.push({
				role: 'tool',
				content: blocksToText(msg.content),
				tool_call_id: msg.toolCallId,
			});
		}
	}

	return msgs;
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
		const body = JSON.stringify({
			model: model.id,
			messages: convertMessages(context),
			max_tokens: model.maxTokens ?? 1024,
			stream: false,
			...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
		});

		const doFetch = (tok: string) => fetch(model.baseUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...model.headers, Authorization: `Bearer ${tok}` },
			body,
			signal: options?.signal,
		});

		let res = await doFetch(_token!);

		if (res.status === 401 && _oauthCreds) {
			const refreshed = await getZohoAccessToken(_oauthCreds);
			_token = refreshed;
			res = await doFetch(refreshed);
		}

		if (!res.ok) {
			const errText = await res.text().catch(() => res.statusText);
			output.stopReason = 'error';
			(output as never as { errorMessage: string }).errorMessage = errText;
			eventStream.push({ type: 'error', reason: 'error', error: output });
			return;
		}

		type CatalystResponse = {
			response: string;
			usage?: { prompt_tokens: number; completion_tokens: number };
		};

		const data = (await res.json()) as CatalystResponse;

		if (data.response) {
			const text = data.response;
			const textBlock = { type: 'text' as const, text };
			(output.content as TextContent[]).push(textBlock);
			eventStream.push({ type: 'text_start', contentIndex: 0, partial: output });
			eventStream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: output });
			eventStream.push({ type: 'text_end', contentIndex: 0, content: text, partial: output });
		}

		output.stopReason = 'stop';

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
}

/** Registers the Catalyst GLM API provider with Flue and stores credentials for token refresh. */
export function registerCatalystGLM({
	endpoint,
	orgId,
	token,
	oauth,
	providerId = 'catalyst-glm',
	maxTokens = 1024,
}: RegisterCatalystGLMOptions): void {
	_token = token;
	_oauthCreds = oauth ?? null;
	registerProvider(providerId, {
		api: CATALYST_GLM_API,
		baseUrl: endpoint,
		headers: { 'CATALYST-ORG': orgId },
		maxTokens,
	});
}
