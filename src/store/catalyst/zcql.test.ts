import { describe, it, expect } from 'vitest';
import { assertNumericId, escapeZcqlString, unwrapRows } from './zcql';

describe('escapeZcqlString', () => {
	it('wraps in single quotes', () => {
		expect(escapeZcqlString('hello')).toBe("'hello'");
	});
	it('doubles embedded single quotes (injection defense)', () => {
		expect(escapeZcqlString("O'Brien")).toBe("'O''Brien'");
		expect(escapeZcqlString("' OR 1=1 --")).toBe("''' OR 1=1 --'");
	});
});

describe('assertNumericId', () => {
	it('passes numeric strings through', () => {
		expect(assertNumericId('12345')).toBe('12345');
	});
	it('throws on non-numeric input', () => {
		expect(() => assertNumericId('1; DROP')).toThrow();
		expect(() => assertNumericId('')).toThrow();
	});
});

describe('unwrapRows', () => {
	it('extracts rows nested under the case-sensitive table key', () => {
		const raw = [
			{ Users: { ROWID: '1', Email: 'a@x.com' } },
			{ Users: { ROWID: '2', Email: 'b@x.com' } },
		];
		expect(unwrapRows('Users', raw)).toEqual([
			{ ROWID: '1', Email: 'a@x.com' },
			{ ROWID: '2', Email: 'b@x.com' },
		]);
	});
	it('skips entries missing the table key and handles non-arrays', () => {
		expect(unwrapRows('Users', [{ Other: { ROWID: '1' } }])).toEqual([]);
		expect(unwrapRows('Users', null)).toEqual([]);
	});
});
