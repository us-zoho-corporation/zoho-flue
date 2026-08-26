import { describe, it, expect } from 'vitest';
import { defineProposeMutationTool, defineProposeMutationBatchTool } from './propose-mutation';
import { consumeMutation } from './mutation-gate';

// Minimal stub context fields every tool's `run()` now requires (toolCallId, log).
const noopLog = { info() {}, warn() {}, error() {} };

describe('propose_mutation', () => {
	it('mints a mutationId that is not yet consumable in the same request', async () => {
		const tool = defineProposeMutationTool('c1', 'turn-1');
		const { output: { mutationId, note } } = await tool.run({
			data: { action: 'Create a Deal', fields: [{ label: 'Deal Name', value: 'Sample Renewal' }] },
		toolCallId: 'test-call', log: noopLog});
		expect(mutationId).toBeTruthy();
		expect(note).toMatch(/end your turn/i);
		expect(consumeMutation('c1', mutationId, 'turn-1')).toBe(false); // same turn — rejected
		expect(consumeMutation('c1', mutationId, 'turn-2')).toBe(true); // later turn — valid
	});
});

describe('propose_mutation_batch', () => {
	it('mints one independent mutationId per action, in order', async () => {
		const tool = defineProposeMutationBatchTool('c1', 'turn-1');
		const { output: { mutationIds, note } } = await tool.run({
			data: {
				actions: [
					{ action: 'Create a Lead', fields: [{ label: 'Last Name', value: 'Doe' }] },
					{ action: 'Create a Deal', fields: [{ label: 'Deal Name', value: 'Doe Renewal' }] },
				],
			},
		toolCallId: 'test-call', log: noopLog});
		expect(mutationIds).toHaveLength(2);
		expect(new Set(mutationIds).size).toBe(2); // each action gets its own distinct id
		expect(note).toMatch(/end your turn/i);
		expect(note).toMatch(/same order/i);
	});

	it('rejects every id from the batch in the same turn it was proposed, same as a single propose_mutation', async () => {
		const tool = defineProposeMutationBatchTool('c1', 'turn-1');
		const { output: { mutationIds } } = await tool.run({
			data: { actions: [{ action: 'Create a Lead', fields: [] }, { action: 'Create a Deal', fields: [] }] },
		toolCallId: 'test-call', log: noopLog});
		for (const id of mutationIds) expect(consumeMutation('c1', id, 'turn-1')).toBe(false);
	});

	it('lets every id from the batch be consumed independently in a later turn, in any order', async () => {
		const tool = defineProposeMutationBatchTool('c1', 'turn-1');
		const { output: { mutationIds } } = await tool.run({
			data: { actions: [{ action: 'Create a Lead', fields: [] }, { action: 'Create a Deal', fields: [] }] },
		toolCallId: 'test-call', log: noopLog});
		// Consuming the second id first doesn't block the first — they're independent.
		expect(consumeMutation('c1', mutationIds[1], 'turn-2')).toBe(true);
		expect(consumeMutation('c1', mutationIds[0], 'turn-2')).toBe(true);
	});

	it('each id is one-time use: a second consume attempt fails', async () => {
		const tool = defineProposeMutationBatchTool('c1', 'turn-1');
		const { output: { mutationIds } } = await tool.run({ data: { actions: [{ action: 'Create a Lead', fields: [] }] } , toolCallId: 'test-call', log: noopLog});
		expect(consumeMutation('c1', mutationIds[0], 'turn-2')).toBe(true);
		expect(consumeMutation('c1', mutationIds[0], 'turn-3')).toBe(false);
	});
});
