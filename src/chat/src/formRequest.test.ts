import { describe, test, expect } from 'vitest';
import { parseFormRequest } from './formRequest';

describe('parseFormRequest', () => {
	test('rejects missing/malformed input', () => {
		expect(parseFormRequest(undefined)).toBeNull();
		expect(parseFormRequest({})).toBeNull();
		expect(parseFormRequest({ prompt: '' })).toBeNull();
		expect(parseFormRequest({ prompt: 'Need more info:' })).toBeNull();
		expect(parseFormRequest({ prompt: 'Need more info:', fields: [] })).toBeNull();
		expect(parseFormRequest({ prompt: 'Need more info:', fields: [{ placeholder: 'orphan' }] })).toBeNull();
	});

	test('normalizes fields with defaults for optional properties', () => {
		const spec = parseFormRequest({
			prompt: 'A few more details to create this Deal:',
			fields: [{ label: 'Deal Name' }],
		});
		expect(spec).toEqual({
			prompt: 'A few more details to create this Deal:',
			fields: [{ label: 'Deal Name', placeholder: '', required: true, multiline: false }],
		});
	});

	test('keeps explicit placeholder/required/multiline and drops a labelless field', () => {
		const spec = parseFormRequest({
			prompt: 'Need a bit more:',
			fields: [
				{ label: 'Description', placeholder: 'What happened?', required: false, multiline: true },
				{ placeholder: 'orphan, no label' },
			],
		});
		expect(spec?.fields).toEqual([
			{ label: 'Description', placeholder: 'What happened?', required: false, multiline: true },
		]);
	});
});
