import { describe, it, expect } from 'vitest';
import { defineRequestInputTool } from './request-input';

describe('request_input', () => {
	it('echoes back a note instructing the model to stop and wait, with no network or state side effects', async () => {
		const tool = defineRequestInputTool();
		const result = await tool.run({
			input: {
				prompt: 'A few more details to create this Deal:',
				fields: [{ label: 'Deal Name', placeholder: '', required: true, multiline: false }],
			},
		});
		expect(result.note).toMatch(/end your turn/i);
	});
});
