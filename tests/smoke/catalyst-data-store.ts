import { describe, it, expect } from 'vitest';
import { CatalystDataStoreClient } from '../../src/store/catalyst/data-store-client.js';
import { escapeZcqlString, unwrapRows } from '../../src/store/catalyst/zcql.js';

/**
 * Live round-trip against the Catalyst Data Store (Development env): insert →
 * query → update → delete a throwaway `Sessions` row. Proves the REST headers,
 * OAuth scopes, and environment wiring end-to-end. Run with `pnpm test:smoke`.
 *
 * Prerequisites: the `Sessions` table must exist and the service-account refresh
 * token must carry `ZohoCatalyst.tables.rows.*` + `ZohoCatalyst.zcql.CREATE`.
 */
describe('catalyst data store', () => {
	const { CATALYST_PROJECT_ID, CATALYST_ORG_ID, ZOHO_OAUTH_CLIENT_ID, ZOHO_OAUTH_CLIENT_SECRET, ZOHO_OAUTH_REFRESH_TOKEN } = process.env;
	const ready = Boolean(CATALYST_PROJECT_ID && CATALYST_ORG_ID && ZOHO_OAUTH_CLIENT_ID && ZOHO_OAUTH_CLIENT_SECRET && ZOHO_OAUTH_REFRESH_TOKEN);

	it.skipIf(!ready)('round-trips a Sessions row', async () => {
		const client = new CatalystDataStoreClient({
			baseUrl: process.env.CATALYST_API_BASE_URL ?? 'https://api.catalyst.zoho.com/baas/v1',
			projectId: CATALYST_PROJECT_ID!,
			orgId: CATALYST_ORG_ID!,
			environment: process.env.CATALYST_ENVIRONMENT ?? 'Development',
			oauth: {
				clientId: ZOHO_OAUTH_CLIENT_ID!,
				clientSecret: ZOHO_OAUTH_CLIENT_SECRET!,
				refreshToken: ZOHO_OAUTH_REFRESH_TOKEN!,
			},
		});

		const sessionId = `smoke-${Date.now()}`;
		const now = Date.now();

		const inserted = await client.insertRows('Sessions', [
			{ SessionId: sessionId, UserId: 'smoke-user', CreatedAt: now, ExpiresAt: now + 60000, LastSeenAt: now },
		]);
		const rowId = String(inserted[0]?.ROWID);
		expect(rowId).toMatch(/^\d+$/);

		try {
			const found = unwrapRows('Sessions', await client.query(
				`SELECT SessionId, UserId FROM Sessions WHERE SessionId = ${escapeZcqlString(sessionId)} LIMIT 1`,
			));
			expect(found[0]?.UserId).toBe('smoke-user');

			await client.updateRows('Sessions', [{ ROWID: rowId, LastSeenAt: now + 5000 }]);
			const after = await client.getRow('Sessions', rowId);
			expect(Number(after?.LastSeenAt)).toBe(now + 5000);
		} finally {
			await client.deleteRow('Sessions', rowId);
		}

		expect(await client.getRow('Sessions', rowId)).toBeNull();
	});
});
