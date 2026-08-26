import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../config', () => ({
	config: {
		zohoLoginScopes: 'AaaServer.profile.READ,ZohoCRM.org.READ',
	},
}));

import { defineCheckZohoConnectionTool } from './check-zoho-connection';
import { parseConnectionRequired } from './connection-required';
import type { ZohoConnectionDeps } from './zoho-connection';

// Minimal stub context fields every tool's `run()` now requires (toolCallId, log).
const noopLog = { info() {}, warn() {}, error() {} };

afterEach(() => vi.restoreAllMocks());

const CRM_SCOPES = ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.ALL'];
const DESK_SCOPES = ['Desk.basic.READ', 'Desk.tickets.READ'];

/**
 * Builds a fresh `check_zoho_connection` tool instance.
 * @param deps - Partial overrides for the tool's user/scope dependencies.
 * @returns The `check_zoho_connection` Flue tool under test.
 */
function tool(deps: Partial<ZohoConnectionDeps> = {}) {
	return defineCheckZohoConnectionTool({
		userId: 'u1',
		getGrantedScopes: async () => [...CRM_SCOPES, ...DESK_SCOPES],
		products: [
			{ key: 'crm', label: 'Zoho CRM', description: '', scopes: CRM_SCOPES },
			{ key: 'desk', label: 'Zoho Desk', description: '', scopes: DESK_SCOPES },
		],
		...deps,
	});
}

/**
 * Runs a tool call expected to throw and returns the caught error.
 * @param run - A thunk returning the tool's `run()` promise (sync or async).
 * @returns The rejected value, expected to be an `Error`.
 */
async function catchError(run: () => unknown): Promise<Error> {
	return Promise.resolve(run()).then(
		() => { throw new Error('expected run() to throw, but it resolved'); },
		(e: unknown) => e as Error,
	);
}

describe('check_zoho_connection', () => {
	it('resolves { connected: true } when the product is fully granted', async () => {
		await expect(tool().run({ data: { product: 'crm' } , toolCallId: 'test-call', log: noopLog})).resolves.toEqual({ output: { connected: true } });
	});

	it('throws a connection-required payload for a product with no granted scopes', async () => {
		const err = await catchError(() => tool({ getGrantedScopes: async () => [] }).run({ data: { product: 'crm' } , toolCallId: 'test-call', log: noopLog}));
		expect(parseConnectionRequired(err.message)).toMatchObject({ kind: 'zoho', mode: 'connect', product: 'crm' });
	});

	it('checks CRM and Desk independently', async () => {
		const deps = { getGrantedScopes: async () => CRM_SCOPES };
		await expect(tool(deps).run({ data: { product: 'crm' } , toolCallId: 'test-call', log: noopLog})).resolves.toEqual({ output: { connected: true } });
		const err = await catchError(() => tool(deps).run({ data: { product: 'desk' } , toolCallId: 'test-call', log: noopLog}));
		expect(parseConnectionRequired(err.message)?.product).toBe('desk');
	});

	it('never makes a network call — this is the whole point (cheap, instant, checked before any real tool use)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await tool().run({ data: { product: 'crm' } , toolCallId: 'test-call', log: noopLog});
		await catchError(() => tool({ getGrantedScopes: async () => [] }).run({ data: { product: 'desk' } , toolCallId: 'test-call', log: noopLog}));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
