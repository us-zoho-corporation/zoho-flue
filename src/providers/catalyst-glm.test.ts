import { describe, it, expect } from 'vitest';
import { blocksToText, convertMessages, convertTools } from './catalyst-glm';
import type { Context } from '@earendil-works/pi-ai';

describe('blocksToText', () => {
	it('extracts text from a text block', () => {
		expect(blocksToText([{ type: 'text', text: 'hello' }])).toBe('hello');
	});

	it('replaces image blocks with placeholder', () => {
		expect(blocksToText([{ type: 'image', data: 'abc', mimeType: 'image/png' }])).toBe('[image]');
	});

	it('joins mixed blocks', () => {
		expect(blocksToText([
			{ type: 'text', text: 'see ' },
			{ type: 'image', data: 'abc', mimeType: 'image/png' },
			{ type: 'text', text: ' above' },
		])).toBe('see [image] above');
	});
});

describe('convertMessages', () => {
	const base: Context = { messages: [], tools: [] };

	it('includes system prompt when present', () => {
		const result = convertMessages({ ...base, systemPrompt: 'be helpful' });
		expect(result[0]).toEqual({ role: 'system', content: 'be helpful' });
	});

	it('converts a string user message', () => {
		const result = convertMessages({
			...base,
			messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
		});
		expect(result).toEqual([{ role: 'user', content: 'hi' }]);
	});

	it('converts a user message with content blocks', () => {
		const result = convertMessages({
			...base,
			messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: 0 }],
		});
		expect(result[0].content).toBe('hello');
	});

	it('converts an assistant text message', () => {
		const result = convertMessages({
			...base,
			messages: [{
				role: 'assistant',
				content: [{ type: 'text', text: 'hi there' }],
			} as unknown as Context['messages'][number]],
		});
		expect(result[0]).toEqual({ role: 'assistant', content: 'hi there' });
	});

	it('strips tool_calls from assistant messages — Catalyst GLM rejects them in history', () => {
		const result = convertMessages({
			...base,
			messages: [{
				role: 'assistant',
				content: [{
					type: 'toolCall',
					id: 'call_1',
					name: 'search',
					arguments: { q: 'cats' },
				}],
			} as unknown as Context['messages'][number]],
		});
		expect(result[0]).toEqual({ role: 'assistant', content: '' });
		expect(result[0]).not.toHaveProperty('tool_calls');
	});

	it('converts a tool result as a user message with structured delimiters', () => {
		const result = convertMessages({
			...base,
			messages: [{
				role: 'toolResult',
				toolCallId: 'call_1',
				toolName: 'search',
				content: [{ type: 'text', text: 'result text' }],
				isError: false,
				timestamp: 0,
			}],
		});
		expect(result[0].role).toBe('user');
		expect(result[0].content).toBe('[TOOL_RESULT_START id="call_1"]\nresult text\n[TOOL_RESULT_END]');
		expect(result[0]).not.toHaveProperty('tool_call_id');
	});
});

describe('convertTools', () => {
	it('returns undefined when no tools', () => {
		expect(convertTools(undefined)).toBeUndefined();
	});

	it('maps tools to function format', () => {
		const tools = [{
			name: 'search',
			description: 'search the web',
			parameters: { type: 'object', properties: {} },
		}] as Context['tools'];
		const result = convertTools(tools);
		expect(result).toEqual([{
			type: 'function',
			function: { name: 'search', description: 'search the web', parameters: { type: 'object', properties: {} } },
		}]);
	});
});
