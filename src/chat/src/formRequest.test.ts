import { describe, test, expect } from 'vitest';
import { parseFormRequest, matchFormSubmission, type FormRequestSpec } from './formRequest';

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
			fields: [{ label: 'Deal Name', type: 'text', options: [], placeholder: '', defaultValue: '', required: true }],
		});
	});

	test('keeps explicit placeholder/required/defaultValue and drops a labelless field', () => {
		const spec = parseFormRequest({
			prompt: 'Need a bit more:',
			fields: [
				{ label: 'Description', type: 'textarea', placeholder: 'What happened?', required: false, defaultValue: 'N/A' },
				{ placeholder: 'orphan, no label' },
			],
		});
		expect(spec?.fields).toEqual([
			{ label: 'Description', type: 'textarea', options: [], placeholder: 'What happened?', defaultValue: 'N/A', required: false },
		]);
	});

	test('recognizes date/number/textarea types and falls back to text for an unknown type', () => {
		const spec = parseFormRequest({
			prompt: 'A few more details:',
			fields: [
				{ label: 'Closing Date', type: 'date' },
				{ label: 'Amount', type: 'number' },
				{ label: 'Notes', type: 'textarea' },
				{ label: 'Weird', type: 'bogus' },
			],
		});
		expect(spec?.fields.map((f) => f.type)).toEqual(['date', 'number', 'textarea', 'text']);
	});

	test('keeps options only for a select field, and drops non-string entries', () => {
		const withOptions = parseFormRequest({
			prompt: 'Pick one:',
			fields: [{ label: 'Lead Source', type: 'select', options: ['Web', 'Referral', 42] }],
		});
		expect(withOptions?.fields[0]).toMatchObject({ type: 'select', options: ['Web', 'Referral'] });

		const wrongType = parseFormRequest({
			prompt: 'Pick one:',
			fields: [{ label: 'Notes', type: 'text', options: ['ignored'] }],
		});
		expect(wrongType?.fields[0].options).toEqual([]);
	});
});

describe('matchFormSubmission', () => {
	const spec: FormRequestSpec = {
		prompt: 'A few more details:',
		fields: [
			{ label: 'Deal Name', type: 'text', options: [], placeholder: '', defaultValue: '', required: true },
			{ label: 'Amount', type: 'number', options: [], placeholder: '', defaultValue: '', required: false },
		],
	};

	test('matches a well-formed submission composed from the spec', () => {
		expect(matchFormSubmission(spec, 'Deal Name: Sample Renewal\nAmount: 5000')).toEqual([
			{ label: 'Deal Name', value: 'Sample Renewal' },
			{ label: 'Amount', value: '5000' },
		]);
	});

	test('matches a submission with only some fields filled (optional fields may be omitted)', () => {
		expect(matchFormSubmission(spec, 'Deal Name: Sample Renewal')).toEqual([
			{ label: 'Deal Name', value: 'Sample Renewal' },
		]);
	});

	test('returns null for free text that was not composed from the form', () => {
		expect(matchFormSubmission(spec, 'Sure, go ahead and use Sample Renewal for $5000')).toBeNull();
	});

	test('returns null when any line has an unrecognized label', () => {
		expect(matchFormSubmission(spec, 'Deal Name: Sample Renewal\nMystery Field: huh')).toBeNull();
	});

	test('returns null for empty text', () => {
		expect(matchFormSubmission(spec, '')).toBeNull();
		expect(matchFormSubmission(spec, '   ')).toBeNull();
	});
});
