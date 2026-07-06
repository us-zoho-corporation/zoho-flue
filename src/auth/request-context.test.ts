import { describe, it, expect } from 'vitest';
import { currentUserToken, runWithRequestContext } from './request-context';

describe('request-context', () => {
	it('returns undefined outside any context', () => {
		expect(currentUserToken()).toBeUndefined();
	});

	it('exposes the user token within run()', () => {
		runWithRequestContext({ userToken: 'tok' }, () => {
			expect(currentUserToken()).toBe('tok');
		});
	});

	it('propagates across async continuations', async () => {
		await runWithRequestContext({ userToken: 'tok' }, async () => {
			await Promise.resolve();
			await new Promise((r) => setTimeout(r, 0));
			expect(currentUserToken()).toBe('tok');
		});
	});

	it('does not leak outside the run', () => {
		runWithRequestContext({ userToken: 'tok' }, () => {});
		expect(currentUserToken()).toBeUndefined();
	});
});
