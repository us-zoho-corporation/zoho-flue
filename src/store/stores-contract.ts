import { describe, it, expect, beforeEach } from 'vitest';
import type { Stores } from './types';

/**
 * Behavioral contract for any `Stores` implementation. Import and call from a
 * `*.test.ts` with a factory that returns a fresh, empty `Stores`. The same suite
 * runs against the in-memory backend and (with a mocked-fetch client) the Catalyst
 * backend, guaranteeing parity. This file is not itself a test file.
 */
export function runStoresContract(name: string, makeStores: () => Stores): void {
	describe(`Stores contract: ${name}`, () => {
		let stores: Stores;
		beforeEach(() => { stores = makeStores(); });

		const user = {
			userId: 'zuid-1',
			email: 'a@example.com',
			displayName: 'Ada L',
			firstName: 'Ada',
			lastName: 'Lovelace',
			photoId: null,
			createdAt: 1000,
			lastLoginAt: 1000,
		};

		describe('users', () => {
			it('upserts and reads back by id', async () => {
				await stores.users.upsert(user);
				expect(await stores.users.getById('zuid-1')).toEqual(user);
			});

			it('returns null for an unknown user', async () => {
				expect(await stores.users.getById('nope')).toBeNull();
			});

			it('upsert is idempotent and overwrites', async () => {
				await stores.users.upsert(user);
				await stores.users.upsert({ ...user, displayName: 'Ada B' });
				expect((await stores.users.getById('zuid-1'))?.displayName).toBe('Ada B');
			});

			it('touchLogin updates lastLoginAt only', async () => {
				await stores.users.upsert(user);
				await stores.users.touchLogin('zuid-1', 5000);
				const got = await stores.users.getById('zuid-1');
				expect(got?.lastLoginAt).toBe(5000);
				expect(got?.createdAt).toBe(1000);
			});

			it('does not leak internal references', async () => {
				const input = { ...user };
				await stores.users.upsert(input);
				input.displayName = 'mutated';
				expect((await stores.users.getById('zuid-1'))?.displayName).toBe('Ada L');
			});
		});

		describe('tokens', () => {
			const token = {
				userId: 'zuid-1',
				refreshTokenEnc: 'enc:abc',
				scopes: ['AaaServer.profile.READ'],
				accountsServer: 'https://accounts.zoho.com',
				updatedAt: 2000,
			};

			it('puts, gets, and deletes', async () => {
				await stores.tokens.put(token);
				expect(await stores.tokens.get('zuid-1')).toEqual(token);
				await stores.tokens.delete('zuid-1');
				expect(await stores.tokens.get('zuid-1')).toBeNull();
			});

			it('overwrites on repeated put (merged scopes)', async () => {
				await stores.tokens.put(token);
				await stores.tokens.put({ ...token, scopes: ['AaaServer.profile.READ', 'ZohoCRM.modules.READ'] });
				expect((await stores.tokens.get('zuid-1'))?.scopes).toEqual([
					'AaaServer.profile.READ',
					'ZohoCRM.modules.READ',
				]);
			});
		});

		describe('sessions', () => {
			const session = {
				sessionId: 'sid-1',
				userId: 'zuid-1',
				createdAt: 3000,
				expiresAt: 9000,
				lastSeenAt: 3000,
			};

			it('creates, gets, touches, and deletes', async () => {
				await stores.sessions.create(session);
				expect(await stores.sessions.get('sid-1')).toEqual(session);

				await stores.sessions.touch('sid-1', 4000, 10000);
				const got = await stores.sessions.get('sid-1');
				expect(got?.lastSeenAt).toBe(4000);
				expect(got?.expiresAt).toBe(10000);

				await stores.sessions.delete('sid-1');
				expect(await stores.sessions.get('sid-1')).toBeNull();
			});

			it('deleteAllForUser removes every session for that user only', async () => {
				await stores.sessions.create(session);
				await stores.sessions.create({ ...session, sessionId: 'sid-2' });
				await stores.sessions.create({ ...session, sessionId: 'sid-3', userId: 'zuid-2' });

				await stores.sessions.deleteAllForUser('zuid-1');
				expect(await stores.sessions.get('sid-1')).toBeNull();
				expect(await stores.sessions.get('sid-2')).toBeNull();
				expect(await stores.sessions.get('sid-3')).not.toBeNull();
			});
		});

		describe('preferences', () => {
			const prefs = {
				userId: 'zuid-1',
				preferredModelKey: 'claude',
				data: { theme: 'light' },
				updatedAt: 4000,
			};

			it('returns null before any put', async () => {
				expect(await stores.preferences.get('zuid-1')).toBeNull();
			});

			it('puts and reads back', async () => {
				await stores.preferences.put(prefs);
				expect(await stores.preferences.get('zuid-1')).toEqual(prefs);
			});

			it('overwrites on repeated put', async () => {
				await stores.preferences.put(prefs);
				await stores.preferences.put({ ...prefs, preferredModelKey: 'glm', updatedAt: 5000 });
				const got = await stores.preferences.get('zuid-1');
				expect(got?.preferredModelKey).toBe('glm');
				expect(got?.updatedAt).toBe(5000);
			});
		});

		describe('mcpServers', () => {
			const server = {
				id: 'srv-1',
				userId: 'zuid-1',
				name: 'Docs',
				url: 'https://mcp.example.com/mcp',
				transport: 'http' as const,
				authTokenEnc: 'v1:k1:enc',
				enabled: true,
				createdAt: 6000,
				updatedAt: 6000,
			};

			it('creates, lists, gets, updates, and deletes', async () => {
				await stores.mcpServers.create(server);
				expect(await stores.mcpServers.listForUser('zuid-1')).toEqual([server]);
				expect(await stores.mcpServers.get('zuid-1', 'srv-1')).toEqual(server);

				await stores.mcpServers.update({ ...server, name: 'Docs v2', enabled: false, updatedAt: 7000 });
				const updated = await stores.mcpServers.get('zuid-1', 'srv-1');
				expect(updated?.name).toBe('Docs v2');
				expect(updated?.enabled).toBe(false);

				await stores.mcpServers.delete('zuid-1', 'srv-1');
				expect(await stores.mcpServers.get('zuid-1', 'srv-1')).toBeNull();
				expect(await stores.mcpServers.listForUser('zuid-1')).toEqual([]);
			});

			it('isolates servers by user (no cross-user read/delete)', async () => {
				await stores.mcpServers.create(server);
				await stores.mcpServers.create({ ...server, id: 'srv-2', userId: 'zuid-2', createdAt: 6500 });

				expect((await stores.mcpServers.listForUser('zuid-1')).map((s) => s.id)).toEqual(['srv-1']);
				expect(await stores.mcpServers.get('zuid-2', 'srv-1')).toBeNull();

				// Deleting as the wrong user is a no-op.
				await stores.mcpServers.delete('zuid-2', 'srv-1');
				expect(await stores.mcpServers.get('zuid-1', 'srv-1')).not.toBeNull();
			});

			it('lists in creation order', async () => {
				await stores.mcpServers.create({ ...server, id: 'a', createdAt: 300 });
				await stores.mcpServers.create({ ...server, id: 'b', createdAt: 100 });
				await stores.mcpServers.create({ ...server, id: 'c', createdAt: 200 });
				expect((await stores.mcpServers.listForUser('zuid-1')).map((s) => s.id)).toEqual(['b', 'c', 'a']);
			});
		});
	});
}
