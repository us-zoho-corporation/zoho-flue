import { describe, test, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ToolCallRow, NoReplyNotice, AssistantTurn } from './Thread.tsx';
import { collapseTurns } from './flue-model.ts';
import type { AssistantMessage, ChatMessage } from './FlueRuntime.tsx';
import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';

/**
 * Builds a minimal `AssistantMessage` fixture for `AssistantTurn` tests,
 * with sensible empty defaults for parts, tool steps, and UI parts.
 * @param over - Fields to override on the default fixture.
 * @returns The assembled assistant message fixture.
 */
function turn(over: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		id: 't1',
		role: 'assistant',
		parts: [],
		toolSteps: [],
		uiParts: [],
		...over,
	} as AssistantMessage;
}
/**
 * Builds a completed text message part fixture.
 * @param t - The text content of the part.
 * @returns A `text` part with `state: 'done'`.
 */
const textPart = (t: string) => ({ type: 'text' as const, text: t, state: 'done' as const });
/**
 * Builds a completed tool-call step fixture.
 * @param toolName - The tool's name, also used to derive its `toolCallId`.
 * @param input - The tool call's input payload.
 * @returns A tool-call step fixture with `state: 'output-available'`.
 */
const step = (toolName: string, input: unknown = {}) => ({
	toolCallId: `${toolName}-1`, toolName, state: 'output-available' as const, input,
});

// Browser-mode test: renders a real chat component in headless Chromium and
// asserts the live tool-activity UI (the rows shown while the agent searches).
// Run via `pnpm test:browser` — excluded from the default `pnpm test`.
describe('ToolCallRow (browser)', () => {
	test('renders a running KB search with its query, present tense', async () => {
		const screen = await render(
			<ToolCallRow
				toolName="zoho_kb_search"
				toolCallId="c1"
				state="input-available"
				input={{ query: 'payment methods' }}
				index={0}
			/>,
		);
		await expect.element(screen.getByText('Searching “payment methods”')).toBeInTheDocument();
	});

	test('renders a completed API call with its path, past tense', async () => {
		const screen = await render(
			<ToolCallRow
				toolName="zoho_api"
				toolCallId="c2"
				state="output-available"
				input={{ url: 'https://www.zohoapis.com/crm/v2/leads' }}
				index={0}
			/>,
		);
		await expect.element(screen.getByText('Fetched /crm/v2/leads')).toBeInTheDocument();
	});
});

describe('NoReplyNotice (browser)', () => {
	test('shows a friendly fallback and retries on click when there is no error', async () => {
		const onRetry = vi.fn();
		const screen = await render(<NoReplyNotice onRetry={onRetry} />);
		await expect.element(screen.getByText('I couldn’t find an answer to that.')).toBeInTheDocument();
		await screen.getByRole('button', { name: /ask again/i }).click();
		expect(onRetry).toHaveBeenCalledOnce();
	});

	test('surfaces the error message when the run errored', async () => {
		const screen = await render(<NoReplyNotice error={new Error('Provider timed out')} onRetry={() => {}} />);
		await expect.element(screen.getByText('Something went wrong while answering.')).toBeInTheDocument();
		await expect.element(screen.getByText('Provider timed out')).toBeInTheDocument();
	});
});

describe('AssistantTurn (browser) — unified tool-call flow', () => {
	test('running turn shows steps live as an expanded panel, no collapse chip yet', async () => {
		const screen = await render(
			<AssistantTurn
				running
				message={turn({ toolSteps: [step('zoho_kb_search', { query: 'editions' })] })}
			/>,
		);
		// The step is shown live…
		await expect.element(screen.getByText(/Searched “editions”|Searching “editions”/)).toBeInTheDocument();
		// …and there is NO collapsed "N steps" summary chip while running.
		expect(screen.container.textContent).not.toMatch(/\d+ steps?/);
	});

	test('finished turn collapses steps to a chip in place, above the answer', async () => {
		const screen = await render(
			<AssistantTurn
				running={false}
				message={turn({
					parts: [textPart('Professional adds workflows and blueprints.')],
					toolSteps: [step('zoho_kb_search'), step('zoho_kb_get_page')],
				})}
			/>,
		);
		// The answer is shown…
		await expect.element(screen.getByText(/Professional adds workflows/)).toBeInTheDocument();
		// …and the steps have collapsed to a compact summary chip (in place, not a floating card).
		await expect.element(screen.getByRole('button', { name: /2 steps/ })).toBeInTheDocument();
		// The steps chip precedes the answer in document order (process on top).
		const html = screen.container.innerHTML;
		expect(html.indexOf('2 steps')).toBeLessThan(html.indexOf('Professional adds workflows'));
	});

	test('a running turn with no steps or text yet shows Thinking', async () => {
		const screen = await render(<AssistantTurn running message={turn()} />);
		await expect.element(screen.getByText('Thinking')).toBeInTheDocument();
	});
});

// Drives the live streaming transition through the REAL pipeline
// (collapseTurns → AssistantTurn) in headless Chromium: as the simulated event
// stream grows, we rerender and assert the turn morphs in place — steps build
// live, then collapse to a chip beside the answer. No floating card, no teleport.
describe('AssistantTurn streaming transition (browser)', () => {
	const userMsg: FlueConversationMessage = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'compare editions', state: 'done' }] };
	let k = 0;
	/**
	 * Builds an assistant `FlueConversationMessage` fixture with an
	 * auto-incrementing id, wrapping the given parts.
	 * @param parts - The conversation parts to attach to the message.
	 * @returns The assembled assistant message fixture.
	 */
	const asst = (...parts: FlueConversationPart[]): FlueConversationMessage => ({ id: `a${k++}`, role: 'assistant', parts });
	/**
	 * Builds a `dynamic-tool` conversation part fixture, shaped as either an
	 * in-flight call (no output) or a completed call (with a stub `{ ok: true }` output).
	 * @param toolName - The tool's name, also used as its `toolCallId`.
	 * @param state - Whether the call is still in flight or has completed.
	 * @param input - The tool call's input payload.
	 * @returns The assembled `dynamic-tool` part fixture.
	 */
	const toolPart = (toolName: string, state: 'input-available' | 'output-available', input: unknown): FlueConversationPart =>
		state === 'input-available'
			? { type: 'dynamic-tool', toolName, toolCallId: toolName, state, input }
			: { type: 'dynamic-tool', toolName, toolCallId: toolName, state, input, output: { ok: true } };

	/**
	 * Runs a list of raw conversation messages through the real `collapseTurns`
	 * pipeline and returns the resulting trailing assistant turn.
	 * @param msgs - The raw conversation messages to collapse.
	 * @returns The trailing collapsed assistant turn.
	 * @throws If the collapsed history is empty or its last entry isn't an assistant turn.
	 */
	const trailingTurn = (msgs: FlueConversationMessage[]): ChatMessage => {
		const entry = collapseTurns(msgs).at(-1);
		if (!entry || entry.role !== 'assistant') throw new Error('expected a trailing assistant turn');
		return entry;
	};

	test('steps build live while running, then collapse in place above the answer', async () => {
		// T1 — first search in flight.
		const t1 = trailingTurn([userMsg, asst(toolPart('zoho_kb_search', 'input-available', { query: 'editions' }))]);
		const screen = await render(<AssistantTurn running message={t1} />);
		await expect.element(screen.getByText('Searching “editions”')).toBeInTheDocument();
		expect(screen.container.textContent).not.toMatch(/\d+ steps?/); // no collapse chip yet
		expect(screen.container.textContent).not.toContain('Thinking');

		// T2 — first search done, a page read now in flight. Steps grow in place.
		const t2 = trailingTurn([
			userMsg,
			asst(toolPart('zoho_kb_search', 'output-available', { query: 'editions' })),
			asst(toolPart('get_page', 'input-available', { url: 'https://help.zoho.com/crm/editions' })),
		]);
		await screen.rerender(<AssistantTurn running message={t2} />);
		await expect.element(screen.getByText('Searched “editions”')).toBeInTheDocument();
		await expect.element(screen.getByText('Reading /crm/editions')).toBeInTheDocument();
		expect(screen.container.textContent).not.toMatch(/\d+ steps?/);

		// T3 — run finished with a written answer. Steps collapse to a chip that sits
		// ABOVE the answer; nothing has teleported to a different part of the thread.
		const t3 = trailingTurn([
			userMsg,
			asst(toolPart('zoho_kb_search', 'output-available', { query: 'editions' })),
			asst(toolPart('get_page', 'output-available', { url: 'https://help.zoho.com/crm/editions' })),
			asst({ type: 'text', text: 'Enterprise adds automation and analytics.', state: 'done' }),
		]);
		await screen.rerender(<AssistantTurn running={false} message={t3} />);
		await expect.element(screen.getByText('Enterprise adds automation and analytics.')).toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: /2 steps/ })).toBeInTheDocument();
		const html = screen.container.innerHTML;
		expect(html.indexOf('2 steps')).toBeLessThan(html.indexOf('Enterprise adds automation'));
	});
});
