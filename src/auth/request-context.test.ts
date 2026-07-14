import { describe, it, expect } from 'vitest';
import { currentTurnContext, currentUserToken, runWithRequestContext, setTurnContext } from './request-context';

describe('request-context: userToken (AsyncLocalStorage)', () => {
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

describe('request-context: turn context (per-conversation map)', () => {
	it('returns undefined for a conversation that has never had a turn recorded', () => {
		expect(currentTurnContext('never-seen')).toBeUndefined();
	});

	it('returns what was set for that conversation', () => {
		setTurnContext('conv-1', { hitlAutoApprove: true, requestId: 'req-1', mcpTools: [] });
		expect(currentTurnContext('conv-1')).toEqual({ hitlAutoApprove: true, requestId: 'req-1', mcpTools: [] });
	});

	it('scopes context per conversation id', () => {
		setTurnContext('conv-2', { requestId: 'req-a' });
		setTurnContext('conv-3', { requestId: 'req-b' });
		expect(currentTurnContext('conv-2')?.requestId).toBe('req-a');
		expect(currentTurnContext('conv-3')?.requestId).toBe('req-b');
	});

	it('a later turn overwrites an earlier one for the same conversation, read as a plain synchronous lookup', () => {
		// Regression test for the reproduced bug this module's map-based design
		// replaced AsyncLocalStorage to fix: `defineAgent`'s initializer can be
		// invoked from a stale async continuation of an earlier, already-
		// completed request, which — under ALS — read that earlier request's
		// requestId instead of the current one, permanently defeating the
		// mutation confirmation gate. A plain Map.get() has no such notion of
		// "which async chain is this" to get stale — it always returns whatever
		// was last written for that conversation id, regardless of who reads it
		// or from what continuation.
		setTurnContext('conv-4', { requestId: 'turn-A' });
		const readDuringTurnA = () => currentTurnContext('conv-4');
		expect(readDuringTurnA()?.requestId).toBe('turn-A');

		setTurnContext('conv-4', { requestId: 'turn-B' });
		// Even a reference captured "during" turn A now observes turn B's value —
		// there is no stale snapshot to fall back to.
		expect(readDuringTurnA()?.requestId).toBe('turn-B');
	});
});
