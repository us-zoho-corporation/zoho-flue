import { describe, it, expect } from 'vitest';
import { consumeMutation, isMutatingMethod, proposeMutation } from './mutation-gate';

describe('isMutatingMethod', () => {
	it('flags POST, PUT, PATCH, and DELETE as mutating', () => {
		expect(isMutatingMethod('POST')).toBe(true);
		expect(isMutatingMethod('PUT')).toBe(true);
		expect(isMutatingMethod('PATCH')).toBe(true);
		expect(isMutatingMethod('DELETE')).toBe(true);
	});

	it('does not flag GET as mutating', () => {
		expect(isMutatingMethod('GET')).toBe(false);
	});
});

describe('proposeMutation / consumeMutation', () => {
	it('rejects consumption in the same request it was proposed in', () => {
		const id = proposeMutation('conv-1', 'delete the record', 'req-1');
		expect(consumeMutation('conv-1', id, 'req-1')).toBe(false);
	});

	it('accepts consumption from a later request', () => {
		const id = proposeMutation('conv-2', 'delete the record', 'req-1');
		expect(consumeMutation('conv-2', id, 'req-2')).toBe(true);
	});

	it('leaves a same-request attempt pending, so a later legitimate attempt still succeeds', () => {
		const id = proposeMutation('conv-3', 'delete the record', 'req-1');
		expect(consumeMutation('conv-3', id, 'req-1')).toBe(false); // premature, same turn
		expect(consumeMutation('conv-3', id, 'req-2')).toBe(true);  // later turn — now valid
	});

	it('is one-time use', () => {
		const id = proposeMutation('conv-4', 'delete the record', 'req-1');
		expect(consumeMutation('conv-4', id, 'req-2')).toBe(true);
		expect(consumeMutation('conv-4', id, 'req-3')).toBe(false);
	});

	it('rejects an unknown id', () => {
		expect(consumeMutation('conv-5', 'no-such-id', 'req-2')).toBe(false);
	});

	it('rejects a valid id used against the wrong conversation', () => {
		const id = proposeMutation('conv-6', 'delete the record', 'req-1');
		expect(consumeMutation('conv-7', id, 'req-2')).toBe(false);
	});

	it('scopes ids per conversation — the same id string cannot leak across conversations', () => {
		const idA = proposeMutation('conv-8', 'delete deal A', 'req-1');
		const idB = proposeMutation('conv-9', 'delete deal B', 'req-1');
		expect(idA).not.toBe(idB);
		expect(consumeMutation('conv-9', idA, 'req-2')).toBe(false);
		expect(consumeMutation('conv-8', idA, 'req-2')).toBe(true);
	});
});
