import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../config', () => ({
    config: {
        zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
        zohoApiMaxRedirects: 5,
    },
}));

// The tool resolves its bearer token via getZohoAccessToken(oauth) on each call.
// Mock it to return a fixed token so tests stay offline and deterministic.
// (Inlined literal — vi.mock factories run hoisted, before top-level consts.)
vi.mock('../auth/zoho-auth', () => ({
    getZohoAccessToken: vi.fn(async () => 'test-token'),
}));

import { defineZohoApiTool, type MutationGateContext } from './zoho-api';
import { proposeMutation } from './mutation-gate';

const TOKEN = 'test-token';
const OAUTH = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

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
 * Builds a fresh `zoho_api` tool instance using the fixed test OAuth credentials.
 * Defaults to `autoApprove: true` (mutation gate bypassed) so tests unrelated to
 * the gate aren't coupled to it — see the dedicated "mutation gate" suite below.
 * @param gate - Partial overrides for the mutation-gate context.
 * @returns The `zoho_api` Flue tool under test.
 */
function tool(gate: Partial<MutationGateContext> = {}) {
    return defineZohoApiTool(OAUTH, { conversationId: 'c1', requestId: 'r1', autoApprove: true, ...gate });
}

describe('zoho_api SSRF protection', () => {
    it('allows requests to zoho.com subdomains', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://api.zoho.com/v2/test' } }))
            .resolves.toMatchObject({ status: 200 });
    });

    it('allows requests to zohoapis.com subdomains', async () => {
        mockFetch([{ status: 200, body: '{}' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v2/leads' } }))
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
        await tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v2/leads' } });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('blocks redirects to disallowed domains', async () => {
        mockFetch([{ status: 302, location: 'https://evil.com/exfil' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/redirect' } }))
            .rejects.toThrow('Redirect blocked');
    });

    it('follows redirects within allowed domains', async () => {
        mockFetch([
            { status: 302, location: 'https://api.zohoapis.com/crm/v2/leads' },
            { status: 200, body: '{"data":[]}' },
        ]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/crm/v2/leads' } }))
            .resolves.toMatchObject({ status: 200, body: '{"data":[]}' });
    });

    it('throws after exceeding the redirect limit', async () => {
        mockFetch([{ status: 302, location: 'https://www.zohoapis.com/next' }]);
        await expect(tool().run({ input: { method: 'GET', url: 'https://www.zohoapis.com/start' } }))
            .rejects.toThrow('Too many redirects');
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
