// Pure view-model helpers that turn Flue's flat message list into the shape the
// chat UI renders. Kept free of React so the turn-collapsing rules — the source
// of several chat-experience bugs — can be unit-tested directly.
import type { FlueConversationMessage } from '@flue/react';
import { isA2uiTool, type A2uiToolPart } from './a2ui/index.ts';

export interface ToolCallInfo {
	toolCallId: string;
	toolName: string;
	state: 'input-available' | 'output-available' | 'output-error';
	input: unknown;
}

export interface AssistantMessage extends FlueConversationMessage {
	toolSteps: ToolCallInfo[];
	uiParts: A2uiToolPart[];
}

export type ChatMessage = FlueConversationMessage | AssistantMessage;

export function isAssistantMessage(m: ChatMessage): m is AssistantMessage {
	return m.role === 'assistant';
}

function toToolCall(part: Extract<FlueConversationMessage['parts'][number], { type: 'dynamic-tool' }>): ToolCallInfo {
	return { toolCallId: part.toolCallId, toolName: part.toolName, state: part.state, input: part.input };
}

/**
 * Collapse each assistant turn (the run of assistant messages between two user
 * turns) into a single visible entry:
 *   - Data (non-a2ui) tool calls become `toolSteps` (the collapsible list);
 *     a2ui tool calls become `uiParts` (inline charts/tables/cards).
 *   - The visible answer is the last message with text that has no data tool
 *     call after it. That hides "let me search…" preambles but keeps a final
 *     answer even when the model bundles it in the same message as a chart call
 *     — otherwise the reply looks like it never arrived.
 *   - A turn with visualizations but no answer text (chart-only, or still
 *     streaming) is surfaced on a body-less entry.
 */
export function collapseTurns(msgs: FlueConversationMessage[]): ChatMessage[] {
	const result: ChatMessage[] = [];
	let i = 0;
	while (i < msgs.length) {
		const msg = msgs[i];
		if (msg.role !== 'assistant') { result.push(msg); i++; continue; }

		let j = i;
		while (j < msgs.length && msgs[j].role === 'assistant') j++;
		const turn = msgs.slice(i, j);

		const toolSteps: ToolCallInfo[] = [];
		const uiParts: A2uiToolPart[] = [];
		let lastStepIdx = -1; // index of the last data (non-a2ui) tool call
		turn.forEach((m, idx) => {
			for (const part of m.parts) {
				if (part.type !== 'dynamic-tool') continue;
				if (isA2uiTool(part.toolName)) {
					uiParts.push(toToolCall(part));
				} else {
					toolSteps.push(toToolCall(part));
					lastStepIdx = idx;
				}
			}
		});

		let finalText: FlueConversationMessage | undefined;
		for (let k = turn.length - 1; k >= lastStepIdx && k >= 0; k--) {
			if (turn[k].parts.some((p) => p.type === 'text' && p.text)) { finalText = turn[k]; break; }
		}

		if (finalText) {
			result.push({ ...finalText, toolSteps, uiParts });
		} else if (uiParts.length > 0 || toolSteps.length > 0) {
			// A turn that produced visualizations and/or tool steps but no final
			// answer text yet (chart-only, still streaming, or ended on a tool) still
			// gets a body-less entry, so its work stays visible in place rather than
			// vanishing. This is also the live in-flight turn while the agent runs.
			const anchor = turn[turn.length - 1];
			result.push({ ...anchor, parts: [], toolSteps, uiParts });
		}

		i = j;
	}
	return result;
}
