import { describe, test, expect } from 'vitest';
import type { FlueConversationMessage, FlueConversationPart } from '@flue/sdk';
import { collapseTurns, isAssistantMessage, type AssistantMessage } from './flue-model.ts';

// ─── builders ────────────────────────────────────────────────────────────────

let n = 0;
/**
 * Generates a unique, incrementing test message id.
 * @returns A fresh id string of the form `m<n>`.
 */
const id = () => `m${n++}`;

/**
 * Builds a user message with a single text part, for test fixtures.
 * @param t - The message text.
 * @returns A `FlueConversationMessage` with role `'user'`.
 */
function user(t: string): FlueConversationMessage {
	return { id: id(), role: 'user', purpose: 'user', display: 'visible', parts: [text(t)] };
}
/**
 * Builds an assistant message from the given parts, for test fixtures.
 * @param parts - The message parts (text and/or tool calls) to include.
 * @returns A `FlueConversationMessage` with role `'assistant'`.
 */
function assistant(...parts: FlueConversationPart[]): FlueConversationMessage {
	return { id: id(), role: 'assistant', purpose: 'assistant', display: 'visible', parts };
}
/**
 * Builds a completed text message part, for test fixtures.
 * @param t - The text content.
 * @returns A `FlueConversationPart` of type `'text'` in the `'done'` state.
 */
const text = (t: string): FlueConversationPart => ({ type: 'text', text: t, state: 'done' });
/**
 * Builds a completed dynamic-tool message part with a unique call id, for test fixtures.
 * @param toolName - The name of the tool that was called.
 * @param input - The input passed to the tool; defaults to an empty object.
 * @returns A `FlueConversationPart` of type `'dynamic-tool'` in the `'output-available'` state.
 */
const tool = (toolName: string, input: unknown = {}): FlueConversationPart => ({
	type: 'dynamic-tool',
	toolName,
	toolCallId: `${toolName}-${n++}`,
	state: 'output-available',
	input,
	output: { ok: true },
});
/**
 * Builds a failed dynamic-tool message part, for test fixtures.
 * @param toolName - The name of the tool that was called.
 * @param errorText - The thrown error's message.
 * @returns A `FlueConversationPart` of type `'dynamic-tool'` in the `'output-error'` state.
 */
const errorTool = (toolName: string, errorText: string): FlueConversationPart => ({
	type: 'dynamic-tool',
	toolName,
	toolCallId: `${toolName}-${n++}`,
	state: 'output-error',
	input: {},
	errorText,
});

/**
 * Filters `collapseTurns` output down to just the assistant entries.
 * @param msgs - The collapsed messages to filter.
 * @returns The subset of `msgs` that are assistant messages.
 */
function assistants(msgs: ReturnType<typeof collapseTurns>): AssistantMessage[] {
	return msgs.filter(isAssistantMessage);
}

describe('collapseTurns', () => {
	test('passes a plain text answer through with empty steps/uiParts', () => {
		const out = collapseTurns([user('hi'), assistant(text('hello'))]);
		expect(out).toHaveLength(2);
		const a = assistants(out)[0];
		expect(a.parts.some((p) => p.type === 'text' && p.text === 'hello')).toBe(true);
		expect(a.toolSteps).toEqual([]);
		expect(a.uiParts).toEqual([]);
	});

	test('hides a preamble and shows only the final answer, keeping the step', () => {
		const out = collapseTurns([
			user('compare editions'),
			assistant(text('Let me look that up.')),
			assistant(tool('zoho_kb_search', { query: 'editions' })),
			assistant(text('Standard adds workflows.')),
		]);
		const a = assistants(out);
		expect(a).toHaveLength(1);
		const answerText = a[0].parts.filter((p) => p.type === 'text').map((p) => (p.type === 'text' ? p.text : '')).join('');
		expect(answerText).toBe('Standard adds workflows.');
		expect(a[0].toolSteps.map((s) => s.toolName)).toEqual(['zoho_kb_search']);
	});

	test('carries a failed tool step\'s errorText through, not just its state', () => {
		// Regression: toToolCall previously dropped `output`/`errorText` for
		// every tool call, so a component couldn't tell an error apart from a
		// generic failure — needed to render a Connect/Reconnect card from a
		// structured error message.
		const out = collapseTurns([
			user('do the thing'),
			assistant(errorTool('zoho_api', '__connection_required__:{"kind":"zoho"}'), text('You need to connect Zoho CRM first.')),
		]);
		const step = assistants(out)[0].toolSteps[0];
		expect(step.state).toBe('output-error');
		expect(step.errorText).toBe('__connection_required__:{"kind":"zoho"}');
	});

	test('keeps the answer when it is bundled in the same message as a chart call', () => {
		// Regression: previously any text sharing a message with a tool call was
		// dropped as "preamble", so a bundled answer looked like it never arrived.
		const out = collapseTurns([
			user('trend?'),
			assistant(text('Signups are climbing each quarter.'), tool('render_chart', { chartType: 'line' })),
		]);
		const a = assistants(out);
		expect(a).toHaveLength(1);
		expect(a[0].parts.some((p) => p.type === 'text' && p.text.includes('climbing'))).toBe(true);
		expect(a[0].uiParts.map((u) => u.toolName)).toEqual(['render_chart']);
		expect(a[0].toolSteps).toEqual([]); // a2ui tools are not step dots
	});

	test('surfaces a chart-only turn on a body-less entry', () => {
		const out = collapseTurns([user('chart it'), assistant(tool('render_chart', { chartType: 'bar' }))]);
		const a = assistants(out);
		expect(a).toHaveLength(1);
		expect(a[0].parts.filter((p) => p.type === 'text' && p.text)).toHaveLength(0);
		expect(a[0].uiParts.map((u) => u.toolName)).toEqual(['render_chart']);
	});

	test('surfaces a steps-only turn (searched but no answer yet) so the work stays visible', () => {
		// The live in-flight turn, and the ended-on-a-tool case: no final text, no
		// a2ui — but the steps must still appear rather than the turn being dropped.
		const out = collapseTurns([user('q'), assistant(tool('zoho_kb_search', { query: 'q' }))]);
		const a = assistants(out);
		expect(a).toHaveLength(1);
		expect(a[0].parts.filter((p) => p.type === 'text' && p.text)).toHaveLength(0);
		expect(a[0].toolSteps.map((s) => s.toolName)).toEqual(['zoho_kb_search']);
	});

	test('splits data tools into steps and a2ui tools into uiParts', () => {
		const out = collapseTurns([
			user('compare plans'),
			assistant(tool('zoho_kb_search', { query: 'plans' })),
			assistant(tool('render_comparison_table', { columns: ['a'] })),
			assistant(text('Pro is the best value.')),
		]);
		const a = assistants(out)[0];
		expect(a.toolSteps.map((s) => s.toolName)).toEqual(['zoho_kb_search']);
		expect(a.uiParts.map((u) => u.toolName)).toEqual(['render_comparison_table']);
	});
});

describe('collapseTurns — steps vs a2ui split during an in-flight turn', () => {
	test('keeps data-tool steps across a preamble', () => {
		const a = collapseTurns([
			user('q'),
			assistant(text('Let me check the docs.')),
			assistant(tool('zoho_kb_search', { query: 'q' })),
		]).filter(isAssistantMessage);
		expect(a).toHaveLength(1);
		expect(a[0].toolSteps.map((s) => s.toolName)).toEqual(['zoho_kb_search']);
	});

	test('a2ui tools are uiParts, never step dots', () => {
		const a = collapseTurns([user('q'), assistant(tool('render_chart', { chartType: 'bar' }))])
			.filter(isAssistantMessage);
		expect(a[0].toolSteps).toEqual([]);
		expect(a[0].uiParts.map((u) => u.toolName)).toEqual(['render_chart']);
	});
});
