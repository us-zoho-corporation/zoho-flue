import { describe, it, expect, vi, afterEach } from 'vitest';

// `vi.mock` factories are hoisted above top-level consts, so the scope lists
// are inlined here rather than shared via an outer variable (referencing one
// would throw "Cannot access ... before initialization").
vi.mock('../config', () => ({
    config: {
        zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
        zohoApiMaxRedirects: 5,
        zohoApiMaxResponseChars: 100_000,
        zohoLoginScopes: 'AaaServer.profile.READ,ZohoCRM.org.READ',
        zohoProducts: [
            { key: 'crm', label: 'Zoho CRM', description: '', scopes: ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.ALL'] },
            { key: 'desk', label: 'Zoho Desk', description: '', scopes: ['Desk.basic.READ', 'Desk.tickets.READ'] },
        ],
    },
}));

import { defineZohoApiTool, type MutationGateContext, type ZohoApiDeps } from './zoho-api';
import { proposeMutation } from './mutation-gate';
import { parseConnectionRequired } from './connection-required';

const TOKEN = 'test-token';
const CRM_SCOPES = ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.ALL'];
const DESK_SCOPES = ['Desk.basic.READ', 'Desk.tickets.READ'];

afterEach(() => vi.restoreAllMocks());

/**
 * Stubs the global `fetch` to return canned responses in sequence, repeating the
 * last one for any calls past the end of the list (used to simulate redirect chains).
 * @param responses - Canned responses, each with a status, optional `Location` header, and body text.
 */
function mockFetch(responses: Array<{ status: number; location?: string; body?: string }>) {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
        const r = responses[Math.min(call++, responses.length - 1)];
        return Promise.resolve({
            status: r.status,
            headers: { get: (key: string) => key === 'location' ? (r.location ?? null) : null },
            text: async () => r.body ?? '',
        });
    }));
}

/**
 * Builds a fresh `zoho_api` tool instance. Defaults `autoApprove: true` (mutation
 * gate bypassed) and grants both CRM and Desk scopes so tests unrelated to those
 * gates aren't coupled to them — see the dedicated suites below for each.
 * @param gate - Partial overrides for the mutation-gate context.
 * @param deps - Partial overrides for the tool's user/scope dependencies.
 * @returns The `zoho_api` Flue tool under test.
 */
function tool(gate: Partial<MutationGateContext> = {}, deps: Partial<ZohoApiDeps> = {}) {
    return defineZohoApiTool(
        {
            userId: 'u1',
            getUserToken: async () => TOKEN,
            getGrantedScopes: async () => [...CRM_SCOPES, ...DESK_SCOPES],
            products: [
                { key: 'crm', label: 'Zoho CRM', description: '', scopes: CRM_SCOPES },
                { key: 'desk', label: 'Zoho Desk', description: '', scopes: DESK_SCOPES },
            ],
            ...deps,
        },
        { conversationId: 'c1', requestId: 'r1', autoApprove: true, ...gate },
    );
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

describe('zoho_api SSRF protection', () => {
    it('allows requests to zoho.com subdomains', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://api.zoho.com/crm/v8/test' } }))
            .resolves.toMatchObject({ status: 200 });
    });

    it('allows requests to zohoapis.com subdomains', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }))
            .resolves.toMatchObject({ status: 200 });
    });

    it('blocks requests to disallowed domains', async () => {
        await expect(tool().run({ input: { method: 'GET', url: 'https://evil.com/steal' } }))
            .rejects.toThrow('Request blocked');
    });

    it('blocks subdomain-spoofing attempts', async () => {
        await expect(tool().run({ input: { method: 'GET', url: 'https://zohoapis.com.evil.com/' } }))
            .rejects.toThrow('Request blocked');
    });

    it('injects the Authorization header', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            headers: { get: () => null },
            text: async () => '{}',
        });
        vi.stubGlobal('fetch', fetchMock);
        await tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('blocks redirects to disallowed domains', async () => {
        mockFetch([{ status: 302, location: 'https://evil.com/exfil' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/redirect' } }))
            .rejects.toThrow('Redirect blocked');
    });

    it('follows redirects within allowed domains', async () => {
        mockFetch([
            { status: 302, location: 'https://api.zohoapis.com/crm/v8/leads' },
            { status: 200, body: '{"data":[]}' },
        ]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }))
            .resolves.toMatchObject({ status: 200, body: '{"data":[]}' });
    });

    it('throws after exceeding the redirect limit', async () => {
        mockFetch([{ status: 302, location: 'https://www.zohoapis.com/next' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/start' } }))
            .rejects.toThrow('Too many redirects');
    });
});

describe('zoho_api response truncation', () => {
    it('passes a response under the limit through unchanged', async () => {
        const body = '{"data":[]}';
        mockFetch([{ status: 200, body }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }))
            .resolves.toEqual({ status: 200, body });
    });

    it('truncates a response over the limit and notes it, instead of blowing the model\'s context budget', async () => {
        const huge = 'x'.repeat(150_000);
        mockFetch([{ status: 200, body: huge }]);
        const result = await tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } });
        expect(result.body.length).toBeLessThan(huge.length);
        expect(result.body).toContain('x'.repeat(100_000));
        expect(result.body).toMatch(/truncated: response was 150000 characters/);
    });
});

describe('zoho_api connection/scope gate', () => {
    it('throws a connect payload when the user has none of the product scopes', async () => {
        const err = await catchError(() => tool({}, { getGrantedScopes: async () => ['AaaServer.profile.READ'] })
            .run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }));
        const payload = parseConnectionRequired(err.message);
        expect(payload).toMatchObject({ kind: 'zoho', mode: 'connect', product: 'crm' });
    });

    it('does not count scopes shared with the default login grant as a prior connection', async () => {
        // ZohoCRM.org.READ-style overlap: everyone gets some login scopes by
        // default, but that alone must not read as "you connected CRM before".
        const err = await catchError(() => tool({}, {
            getGrantedScopes: async () => ['ZohoCRM.org.READ'],
            products: [{ key: 'crm', label: 'Zoho CRM', description: '', scopes: [...CRM_SCOPES, 'ZohoCRM.org.READ'] }],
        }).run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }));
        expect(parseConnectionRequired(err.message)?.mode).toBe('connect');
    });

    it('throws a reconnect payload when some but not all product scopes are granted', async () => {
        const err = await catchError(() => tool({}, { getGrantedScopes: async () => [CRM_SCOPES[0]] })
            .run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }));
        const payload = parseConnectionRequired(err.message);
        expect(payload).toMatchObject({ kind: 'zoho', mode: 'reconnect', product: 'crm' });
    });

    it('proceeds normally once all required scopes are granted', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(
            tool({}, { getGrantedScopes: async () => CRM_SCOPES }).run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/leads' } }),
        ).resolves.toMatchObject({ status: 200 });
    });

    it('gates Desk calls independently from CRM', async () => {
        const err = await catchError(() => tool({}, { getGrantedScopes: async () => CRM_SCOPES })
            .run({ input: { method: 'GET', url: 'https://desk.zoho.com/api/v1/tickets' } }));
        const payload = parseConnectionRequired(err.message);
        expect(payload).toMatchObject({ kind: 'zoho', mode: 'connect', product: 'desk' });
    });

    it('does not gate a URL that is not a known product', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(
            tool({}, { getGrantedScopes: async () => [] }).run({ input: { method: 'GET', url: 'https://api.zoho.com/oauth/user/info' } }),
        ).resolves.toMatchObject({ status: 200 });
    });

    it('checks the connection gate before the mutation gate', async () => {
        // If the user isn't even connected, that's the error to surface —
        // not a confusing "missing mutationId" for an action that can't
        // succeed anyway.
        const err = await catchError(() => tool({ autoApprove: false }, { getGrantedScopes: async () => [] })
            .run({ input: { method: 'POST', url: 'https://www.zohoapis.com/crm/v8/Deals', body: '{}' } }));
        expect(parseConnectionRequired(err.message)?.kind).toBe('zoho');
    });
});

describe('zoho_api mutation confirmation gate', () => {
    it('blocks a mutating call with no mutationId, regardless of what the model claims', async () => {
        await expect(
            tool({ autoApprove: false }).run({ input: { method: 'POST', url: 'https://www.zohoapis.com/crm/v8/Deals', body: '{}' } }),
        ).rejects.toThrow('Mutating call blocked');
    });

    it('blocks a mutating call with a made-up mutationId', async () => {
        await expect(
            tool({ autoApprove: false }).run({
                input: { method: 'POST', url: 'https://www.zohoapis.com/crm/v8/Deals', body: '{}', mutationId: 'not-a-real-id' },
            }),
        ).rejects.toThrow('Mutating call blocked');
    });

    it('blocks reuse of a mutationId proposed in this same turn (same requestId) — the core determinism guarantee', async () => {
        const mutationId = proposeMutation('c1', 'update the deal', 'turn-1');
        await expect(
            tool({ conversationId: 'c1', requestId: 'turn-1', autoApprove: false }).run({
                input: { method: 'PUT', url: 'https://www.zohoapis.com/crm/v8/Deals/1', body: '{}', mutationId },
            }),
        ).rejects.toThrow('Mutating call blocked');
    });

    it('allows a mutationId proposed in an earlier turn (different requestId)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null }, text: async () => '{}' });
        vi.stubGlobal('fetch', fetchMock);
        const mutationId = proposeMutation('c1', 'update the deal', 'turn-1');
        await expect(
            tool({ conversationId: 'c1', requestId: 'turn-2', autoApprove: false }).run({
                input: { method: 'PUT', url: 'https://www.zohoapis.com/crm/v8/Deals/1', body: '{}', mutationId },
            }),
        ).resolves.toMatchObject({ status: 200 });
    });

    it('is one-time use: a second attempt with the same (already-consumed) mutationId is blocked', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null }, text: async () => '{}' }));
        const mutationId = proposeMutation('c1', 'update the deal', 'turn-1');
        await tool({ conversationId: 'c1', requestId: 'turn-2', autoApprove: false }).run({
            input: { method: 'PUT', url: 'https://www.zohoapis.com/crm/v8/Deals/1', body: '{}', mutationId },
        });
        await expect(
            tool({ conversationId: 'c1', requestId: 'turn-3', autoApprove: false }).run({
                input: { method: 'PUT', url: 'https://www.zohoapis.com/crm/v8/Deals/1', body: '{}', mutationId },
            }),
        ).rejects.toThrow('Mutating call blocked');
    });

    it('a mutationId proposed in one conversation cannot be used in another', async () => {
        const mutationId = proposeMutation('conversation-A', 'update the deal', 'turn-1');
        await expect(
            tool({ conversationId: 'conversation-B', requestId: 'turn-2', autoApprove: false }).run({
                input: { method: 'PUT', url: 'https://www.zohoapis.com/crm/v8/Deals/1', body: '{}', mutationId },
            }),
        ).rejects.toThrow('Mutating call blocked');
    });

    it('bypasses the gate entirely when Auto mode is on, even with no mutationId', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null }, text: async () => '{}' }));
        await expect(
            tool({ autoApprove: true }).run({ input: { method: 'POST', url: 'https://www.zohoapis.com/crm/v8/Deals', body: '{}' } }),
        ).resolves.toMatchObject({ status: 200 });
    });

    it('never gates non-mutating (GET) calls', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null }, text: async () => '{}' }));
        await expect(
            tool({ autoApprove: false }).run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v8/Deals/1' } }),
        ).resolves.toMatchObject({ status: 200 });
    });
});

describe('zoho_api extra headers', () => {
    it('forwards a caller-supplied header, e.g. Desk orgId', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            headers: { get: () => null },
            text: async () => '{}',
        });
        vi.stubGlobal('fetch', fetchMock);
        await tool().run({
            input: { method: 'GET', url: 'https://desk.zoho.com/api/v1/tickets', headers: { orgId: '123' } },
        });
        expect(fetchMock.mock.calls[0][1].headers.orgId).toBe('123');
    });

    it('does not let caller headers override Authorization or Content-Type', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            headers: { get: () => null },
            text: async () => '{}',
        });
        vi.stubGlobal('fetch', fetchMock);
        await tool().run({
            input: {
                method: 'POST',
                url: 'https://www.zohoapis.com/crm/v8/Leads',
                body: '{}',
                headers: { Authorization: 'Bearer evil', 'Content-Type': 'text/plain' },
            },
        });
        const sentHeaders = fetchMock.mock.calls[0][1].headers;
        expect(sentHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(sentHeaders['Content-Type']).toBe('application/json');
    });
});
