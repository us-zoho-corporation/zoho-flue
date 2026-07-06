import { describe, it, expect } from 'vitest';
import { safeReturnTo, unionScopes } from './session';

describe('safeReturnTo', () => {
	it('accepts same-origin relative paths', () => {
		expect(safeReturnTo('/')).toBe('/');
		expect(safeReturnTo('/chat')).toBe('/chat');
		expect(safeReturnTo('/chat?tab=1#x')).toBe('/chat?tab=1#x');
	});

	it('rejects open-redirect vectors, falling back to /', () => {
		expect(safeReturnTo(undefined)).toBe('/');
		expect(safeReturnTo('')).toBe('/');
		expect(safeReturnTo('https://evil.com')).toBe('/');
		expect(safeReturnTo('//evil.com')).toBe('/'); // protocol-relative
		expect(safeReturnTo('/\\evil.com')).toBe('/'); // backslash → normalized to //
		expect(safeReturnTo('/\tevil')).toBe('/'); // control char
		expect(safeReturnTo('/foo\r\nSet-Cookie: x')).toBe('/'); // header injection
		expect(safeReturnTo('javascript:alert(1)')).toBe('/');
	});
});

describe('unionScopes', () => {
	it('merges lists, preserving order and de-duplicating', () => {
		expect(unionScopes(['a', 'b'], ['b', 'c'], [''])).toEqual(['a', 'b', 'c']);
	});
});
