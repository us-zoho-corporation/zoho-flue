import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../config', () => ({
	config: {
		zohoClientId: 'id',
		zohoClientSecret: 'secret',
		zohoRefreshToken: 'refresh',
		zohoDocsBearerToken: '',
		zohoAllowedHostnames: ['zoho.com', 'zohoapis.com'],
		zohoApiMaxRedirects: 5,
		chatModels: [
			{ key: 'claude', label: 'Claude Sonnet 5', spec: 'anthropic/claude-sonnet-5', requiresAuth: false },
			{ key: 'other', label: 'Other Model', spec: 'other-provider/other-model', requiresAuth: true },
		],
		defaultChatModelKey: 'claude',
	},
}));

// assistantMiddleware only needs resolveUserId/getUserToken; resolveUserId reads a plain
// test header instead of a real signed session cookie — session-cookie parsing
// itself is covered by src/auth/session.test.ts, not this file's concern.
vi.mock('../../auth', () => ({
	getAuth: () => ({
		resolveUserId: async (c: { req: { header: (name: string) => string | undefined } }) =>
			c.req.header('x-test-user-id') ?? null,
		getUserToken: async () => 'test-user-token',
	}),
}));

vi.mock('../../mcp/live', () => ({ loadUserMcpTools: async () => [] }));

// One real in-memory Stores instance, shared for the life of this test file (module
// mocks are cached, so the factory below runs once). A dynamic import inside the
// factory avoids relying on vi.mock's hoisting-vs-const-initialization ordering.
// Tests use distinct conversation ids to avoid cross-test ownership contamination.
vi.mock('../../store', async () => {
	const { createMemoryStores } = await import('../../store/memory/memory-stores');
	const stores = createMemoryStores();
	return { getStores: () => stores };
});

import { modelForConversation, resolveHitlAutoApprove, assistantMiddleware } from '../assistant';

/**
 * Builds a minimal Hono app that mounts `assistantMiddleware` under test,
 * terminating with a probe handler standing in for the real `createAgentRouter`
 * mount.
 * @returns The configured Hono app.
 */
function makeApp() {
	const app = new Hono();
	app.use('/agents/assistant/:id', assistantMiddleware);
	app.all('/agents/assistant/:id', (c) => c.json({ ok: true }));
	return app;
}

/**
 * Sends a request to a conversation id as a given test user.
 * @param app - The Hono app built by {@link makeApp}.
 * @param userId - The test user id (sent via the `x-test-user-id` header); omit for a guest request.
 * @param id - The conversation instance id.
 * @returns The app's response.
 */
function requestAs(app: Hono, userId: string | undefined, id: string) {
	return app.request(`/agents/assistant/${id}`, {
		method: 'POST',
		headers: userId ? { 'x-test-user-id': userId } : {},
	});
}

describe('modelForConversation', () => {
	it('resolves the model from a `<modelKey>__<uuid>` prefix', () => {
		expect(modelForConversation('other__abc')).toBe('other-provider/other-model');
	});

	it('falls back to the default model for an unknown key', () => {
		expect(modelForConversation('nope__abc')).toBe('anthropic/claude-sonnet-5');
	});

	it('falls back to the default model when the id has no `__` separator', () => {
		expect(modelForConversation('abc')).toBe('anthropic/claude-sonnet-5');
	});
});

describe('resolveHitlAutoApprove', () => {
	it('resolves the literal string "true" to true', () => {
		expect(resolveHitlAutoApprove('true')).toBe(true);
	});

	it('resolves absent (undefined) to false', () => {
		expect(resolveHitlAutoApprove(undefined)).toBe(false);
	});

	it('resolves "false" to false', () => {
		expect(resolveHitlAutoApprove('false')).toBe(false);
	});

	it('resolves any other value to false (must be exactly "true")', () => {
		expect(resolveHitlAutoApprove('1')).toBe(false);
		expect(resolveHitlAutoApprove('TRUE')).toBe(false);
		expect(resolveHitlAutoApprove('yes')).toBe(false);
	});
});

describe('assistantMiddleware (conversation ownership enforcement)', () => {
	it('lets the first user to touch a conversation id through', async () => {
		const res = await requestAs(makeApp(), 'user-a', 'claude__conv-1');
		expect(res.status).toBe(200);
	});

	it('lets the SAME user back into a conversation they already own', async () => {
		const app = makeApp();
		await requestAs(app, 'user-a', 'claude__conv-2');
		const res = await requestAs(app, 'user-a', 'claude__conv-2');
		expect(res.status).toBe(200);
	});

	it('blocks a DIFFERENT user from reading a conversation id the first user already claimed — the core fix', async () => {
		const app = makeApp();
		await requestAs(app, 'user-a', 'claude__conv-3');
		const res = await requestAs(app, 'user-b', 'claude__conv-3');
		expect(res.status).toBe(403);
	});

	it('does not leak the blocked conversation\'s content in the 403 response', async () => {
		const app = makeApp();
		await requestAs(app, 'user-a', 'claude__conv-4');
		const res = await requestAs(app, 'user-b', 'claude__conv-4');
		const body = await res.json();
		expect(body).toEqual({ error: 'forbidden' });
	});

	it('isolates ownership per conversation id — a shared user id does not grant access across ids', async () => {
		const app = makeApp();
		await requestAs(app, 'user-a', 'claude__conv-5a');
		await requestAs(app, 'user-b', 'claude__conv-5b');
		expect((await requestAs(app, 'user-b', 'claude__conv-5a')).status).toBe(403);
		expect((await requestAs(app, 'user-a', 'claude__conv-5b')).status).toBe(403);
	});
});
