import { describe, it, expect } from 'vitest';
import { defineRequestInputTool } from './request-input';

// Minimal stub context fields every tool's `run()` now requires (toolCallId, log).
const noopLog = { info() {}, warn() {}, error() {} };

describe('request_input', () => {
	it('echoes back a note instructing the model to stop and wait, with no network or state side effects', async () => {
		const tool = defineRequestInputTool();
		const { output: result } = await tool.run({
			data: {
				prompt: 'A few more details to create this Deal:',
				fields: [{ label: 'Deal Name', type: 'text', options: [], placeholder: '', defaultValue: '', required: true }],
			},
		toolCallId: 'test-call', log: noopLog});
		expect(result.note).toMatch(/end your turn/i);
	});
});
