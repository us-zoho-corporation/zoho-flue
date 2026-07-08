// Live validation probe for the doc-ambiguous Catalyst NoSQL behaviors the Flue
// persistence adapter depends on. The adapter and NoSQL client are unit-tested
// against an in-memory fake that encodes THIS repo's reading of the docs; this
// script confirms that reading against a real Catalyst NoSQL table.
//
// Prerequisites (all Console-created; the CLI/SDK can't make NoSQL tables):
//   1. A scratch NoSQL table whose partition key attribute is `Id` (String).
//   2. Env vars (same service-account creds the app uses):
//        CATALYST_API_BASE_URL   (default https://api.catalyst.zoho.com/baas/v1)
//        CATALYST_PROJECT_ID  CATALYST_ORG_ID  CATALYST_ENVIRONMENT (default Development)
//        ZOHO_OAUTH_CLIENT_ID  ZOHO_OAUTH_CLIENT_SECRET  ZOHO_OAUTH_REFRESH_TOKEN
//        ZOHO_ACCOUNTS_HOST      (default https://accounts.zoho.com)
//        NOSQL_PROBE_TABLE       (the scratch table name/id)
//
// Run:  node scripts/nosql-probe.mjs
//
// It prints PASS/FAIL/UNKNOWN for each behavior and dumps raw responses so the
// exact wire envelope can be confirmed. It cleans up the rows it creates.

const env = (k, d) => process.env[k] ?? d;
const base = env('CATALYST_API_BASE_URL', 'https://api.catalyst.zoho.com/baas/v1');
const projectId = env('CATALYST_PROJECT_ID');
const orgId = env('CATALYST_ORG_ID');
const environment = env('CATALYST_ENVIRONMENT', 'Development');
const accountsHost = env('ZOHO_ACCOUNTS_HOST', 'https://accounts.zoho.com');
const table = env('NOSQL_PROBE_TABLE');

for (const [k, v] of Object.entries({ CATALYST_PROJECT_ID: projectId, CATALYST_ORG_ID: orgId, NOSQL_PROBE_TABLE: table })) {
	if (!v) { console.error(`Missing required env: ${k}`); process.exit(1); }
}

/**
 * Exchanges the service-account refresh token for an access token.
 * @returns {Promise<string>} The Zoho access token.
 */
async function token() {
	const res = await fetch(`${accountsHost}/oauth/v2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: env('ZOHO_OAUTH_CLIENT_ID'),
			client_secret: env('ZOHO_OAUTH_CLIENT_SECRET'),
			refresh_token: env('ZOHO_OAUTH_REFRESH_TOKEN'),
		}),
	});
	const data = await res.json();
	if (!data.access_token) throw new Error(`token refresh failed: ${JSON.stringify(data)}`);
	return data.access_token;
}

const S = (v) => ({ S: v });
let ACCESS;

/**
 * Sends a NoSQL REST request and returns `{ status, body }`.
 * @param {string} method HTTP method.
 * @param {string} path Path after the table id (e.g. `/item`, `/item/query`).
 * @param {unknown} body JSON body.
 * @returns {Promise<{status:number, body:any}>}
 */
async function call(method, path, body) {
	const res = await fetch(`${base}/project/${projectId}/nosqltable/${table}${path}`, {
		method,
		headers: {
			Authorization: `Zoho-oauthtoken ${ACCESS}`,
			'CATALYST-ORG': orgId,
			Environment: environment,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let parsed;
	try { parsed = JSON.parse(text); } catch { parsed = text; }
	return { status: res.status, body: parsed };
}

const insert = (item, condition) => call('POST', '/item', condition ? { item, condition } : { item });
const query = (id) => call('POST', '/item/query', { key_condition: { partition_key: S(id) } });
const update = (id, item, condition) =>
	call('PUT', '/item', { keys: { partition_key: S(id) }, update_attributes: { item }, ...(condition ? { condition } : {}) });
const del = (id) => call('DELETE', '/item', { keys: { partition_key: S(id) } });

const NOT_EXISTS = { function: { function_name: 'attribute_not_exists', args: [{ attribute_path: ['Id'] }] } };
const line = (verdict, msg) => console.log(`[${verdict}] ${msg}`);

/**
 * Runs the probe suite and prints results.
 * @returns {Promise<void>}
 */
async function main() {
	ACCESS = await token();
	console.log(`Probing NoSQL table "${table}" in ${environment}\n`);

	// 1. Put-if-absent via attribute_not_exists (createStream races, appendEventOnce, idempotency).
	await del('probe-pia');
	await insert({ Id: S('probe-pia'), V: S('first') }, NOT_EXISTS);
	const piaSecond = await insert({ Id: S('probe-pia'), V: S('second') }, NOT_EXISTS);
	const piaRead = await query('probe-pia');
	console.log('  put-if-absent second insert →', JSON.stringify(piaSecond));
	console.log('  put-if-absent read-back    →', JSON.stringify(piaRead.body));
	const piaHeldFirst = JSON.stringify(piaRead.body).includes('first') && !JSON.stringify(piaRead.body).includes('second');
	line(piaSecond.status >= 400 && piaHeldFirst ? 'PASS' : 'CHECK',
		'attribute_not_exists rejects a duplicate-key insert (put-if-absent)');

	// 2. Plain duplicate insert with no condition — does insert overwrite (put) or error?
	await del('probe-dup');
	await insert({ Id: S('probe-dup'), V: S('a') });
	const dup = await insert({ Id: S('probe-dup'), V: S('b') });
	const dupRead = await query('probe-dup');
	console.log('  plain duplicate insert     →', dup.status, JSON.stringify(dup.body));
	console.log('  plain duplicate read-back  →', JSON.stringify(dupRead.body));
	line('INFO', `unconditional duplicate insert ${dup.status < 400 ? 'SUCCEEDED (put/overwrite — auth upsert relies on this)' : 'was REJECTED (auth upsert must switch to update)'}`);

	// 3. Conditional update (equals) — the CAS primitive behind every Flue transition.
	await del('probe-cas');
	await insert({ Id: S('probe-cas'), St: S('queued') });
	const casWin = await update('probe-cas', { St: S('running') }, { attribute: ['St'], operator: 'equals', value: S('queued') });
	const casLose = await update('probe-cas', { St: S('other') }, { attribute: ['St'], operator: 'equals', value: S('queued') });
	const casRead = await query('probe-cas');
	console.log('  conditional update win     →', casWin.status);
	console.log('  conditional update lose    →', casLose.status);
	console.log('  conditional update read    →', JSON.stringify(casRead.body));
	line(casWin.status < 400 && casLose.status >= 400 && JSON.stringify(casRead.body).includes('running') ? 'PASS' : 'CHECK',
		'conditional update acts as compare-and-set');

	// 4. Query envelope shape — confirm parseQueryData in nosql-client.ts matches reality.
	line('INFO', 'query envelope (confirm rows are under data.fetched_data.item):');
	console.log(JSON.stringify(casRead.body, null, 2));

	for (const id of ['probe-pia', 'probe-dup', 'probe-cas']) await del(id);

	await cacheProbe();
	console.log('\nDone. Reconcile any CHECK/INFO lines with the `@remarks validate` notes in src/store/catalyst/{nosql,cache}-client.ts.');
}

/**
 * Probes the one undocumented Cache behavior the session store depends on: what
 * GET returns for a missing/expired key. Runs only when CATALYST_CACHE_SEGMENT
 * is set. `cache-client.ts` treats a 404 (or an absent `cache_value`) as null.
 * @returns {Promise<void>}
 */
async function cacheProbe() {
	const segment = env('CATALYST_CACHE_SEGMENT');
	if (!segment) { console.log('\n(skipping Cache probe — set CATALYST_CACHE_SEGMENT to run it)'); return; }
	console.log(`\nProbing Cache segment "${segment}"`);
	const cacheUrl = (key) => `${base}/project/${projectId}/segment/${segment}/cache${key ? `?cacheKey=${encodeURIComponent(key)}` : ''}`;
	const headers = { Authorization: `Zoho-oauthtoken ${ACCESS}`, 'CATALYST-ORG': orgId, Environment: environment, 'Content-Type': 'application/json' };

	await fetch(cacheUrl(), { method: 'POST', headers, body: JSON.stringify({ cache_name: 'probe-k', cache_value: 'v', expiry_in_hours: 1 }) });
	const hit = await fetch(cacheUrl('probe-k'), { method: 'GET', headers });
	const miss = await fetch(cacheUrl('probe-absent'), { method: 'GET', headers });
	console.log('  get present →', hit.status, JSON.stringify(await hit.json().catch(() => '<non-json>')));
	console.log('  get missing →', miss.status, JSON.stringify(await miss.json().catch(() => '<non-json>')));
	line(miss.status === 404 ? 'PASS' : 'CHECK', 'missing-key GET returns 404 (cache-client maps 404 → null)');
	await fetch(cacheUrl('probe-k'), { method: 'DELETE', headers });
}

main().catch((err) => { console.error(err); process.exit(1); });
