import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';
import { consumeMutation, isMutatingMethod } from './mutation-gate';
import { requireZohoConnection, type ZohoConnectionDeps } from './zoho-connection';

/** Per-turn context the mutation confirmation gate needs (see `mutation-gate.ts`). */
export interface MutationGateContext {
	conversationId: string;
	requestId: string;
	/** When `true` ("Auto mode"), the gate is bypassed entirely — no `mutationId` required. */
	autoApprove: boolean;
}

/** What `zoho_api` needs to run as the logged-in user and check their connection. */
export interface ZohoApiDeps extends ZohoConnectionDeps {
	/** Resolves a live Zoho access token for the user, refreshing via their own stored connection. */
	getUserToken: (userId: string) => Promise<string>;
}

/**
 * Truncates an oversized Zoho API response body to `config.zohoApiMaxResponseChars`,
 * appending a note so the model knows it's seeing a partial response rather
 * than mistaking a cut-off document for the complete one.
 * @param text - The raw response body text.
 * @returns `text` unchanged if within the limit, otherwise the truncated text plus a trailing note.
 */
function truncateResponseBody(text: string): string {
	if (text.length <= config.zohoApiMaxResponseChars) return text;
	return `${text.slice(0, config.zohoApiMaxResponseChars)}\n\n`
		+ `[...truncated: response was ${text.length} characters, showing the first ${config.zohoApiMaxResponseChars}. `
		+ 'This is NOT the complete response — narrow your request instead of assuming it is (e.g. add `fields` '
		+ 'to return fewer columns, reduce `per_page`, add filter criteria, or use a COQL aggregate query).]';
}

/**
 * Returns true if `url`'s hostname matches or is a subdomain of an entry in `config.zohoAllowedHostnames`.
 * @param url - The absolute URL to check.
 * @returns `true` if the URL's hostname is an allowed Zoho domain or a subdomain of one,
 * `false` if it is not allowed or `url` fails to parse.
 */
function isAllowedUrl(url: string): boolean {
	try {
		// Normalize: lowercase hostname, strip trailing dot (DNS absolute form).
		const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
		return config.zohoAllowedHostnames.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		);
	} catch {
		return false;
	}
}

/**
 * Identifies which Zoho product (if any) owns a target URL, by hostname —
 * Desk is always served from `desk.zoho.<dc>`, CRM from `<x>.zohoapis.<dc>`,
 * regardless of data center. Anything else (e.g. a future product, or a
 * hostname `zoho_api` doesn't yet special-case) returns `null`, meaning no
 * per-product connection gate applies to it.
 * @param url - The target URL to classify.
 * @returns `'crm'`, `'desk'`, or `null`.
 */
function productForUrl(url: string): 'crm' | 'desk' | null {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		if (hostname.startsWith('desk.zoho.')) return 'desk';
		if (hostname.includes('zohoapis.')) return 'crm';
		return null;
	} catch {
		return null;
	}
}

/**
 * Returns a tool for making authenticated Zoho API calls as the logged-in
 * user. Before every call to a known product (CRM/Desk), verifies the user
 * has granted that product's full scope bundle — if not, throws a
 * `ConnectionRequiredPayload` (see `connection-required.ts`) instead of
 * proceeding, so the chat UI can offer a Connect/Reconnect button rather than
 * a raw failure or (worse) silently succeeding via a shared credential the
 * user never actually authorized.
 * @param deps - The current user's id and token/scope accessors, plus the configured product scope bundles.
 * @param gate - This turn's mutation-confirmation context. Unless `autoApprove`,
 * every mutating call must carry a `mutationId` minted by `propose_mutation` in
 * an earlier turn — this is enforced here, not left to the model's judgment.
 * @returns A Flue tool named `zoho_api` that performs the authenticated HTTP request.
 */
export function defineZohoApiTool(deps: ZohoApiDeps, gate: MutationGateContext) {
	return defineTool({
		name: 'zoho_api',
		description: 'Make an authenticated HTTP request to a Zoho API endpoint.',
		input: v.object({
			method: v.picklist(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
			url: v.pipe(v.string(), v.description('Full Zoho API URL')),
			body: v.optional(v.string()),
			headers: v.optional(v.pipe(
				v.record(v.string(), v.string()),
				v.description('Extra request headers, e.g. { "orgId": "..." } for Zoho Desk calls. Cannot override Authorization or Content-Type.'),
			)),
			mutationId: v.optional(v.pipe(
				v.string(),
				v.description(
					'Required for POST/PUT/PATCH/DELETE unless Auto mode is on: the id returned by a prior '
					+ 'propose_mutation call, from an earlier turn.',
				),
			)),
		}),
		output: v.object({
			status: v.number(),
			body: v.string(),
		}),
		/**
		 * Executes the authenticated Zoho API request as the logged-in user.
		 * Rejects with a `ConnectionRequiredPayload` if the target is a known
		 * product (CRM/Desk) the user hasn't granted the full scope bundle for.
		 * Mutating methods are further rejected unless `gate.autoApprove` is set
		 * or `input.mutationId` is a valid, not-same-turn id from
		 * `propose_mutation`. The (allowed) URL — and any redirect hops — is
		 * validated against `config.zohoAllowedHostnames` before attaching the
		 * bearer token.
		 * @param data - The requested method, target URL, optional request body, optional
		 * extra headers (e.g. Zoho Desk's `orgId`), and — for mutating methods — the
		 * confirmation `mutationId`.
		 * @param signal - Abort signal forwarded to the underlying `fetch` call.
		 * @returns The final response's HTTP status and body text, truncated (with a trailing
		 * note) at `config.zohoApiMaxResponseChars` if the real response was larger.
		 * @throws {Error} A `ConnectionRequiredPayload`-encoded error (see `connection-required.ts`)
		 * if the target product's scope bundle isn't fully granted; if a mutating call lacks a
		 * valid `mutationId`; if the URL (or a redirect target) is not under an allowed Zoho
		 * domain; or if the number of redirect hops exceeds `config.zohoApiMaxRedirects`.
		 */
		async run({ data, signal }) {
			if (!isAllowedUrl(data.url)) {
				throw new Error(
					`Request blocked: ${data.url} is not under an allowed Zoho domain (${config.zohoAllowedHostnames.join(', ')}).`,
				);
			}

			const product = productForUrl(data.url);
			if (product) await requireZohoConnection(deps, product);

			if (isMutatingMethod(data.method) && !gate.autoApprove) {
				const valid = !!data.mutationId && consumeMutation(gate.conversationId, data.mutationId, gate.requestId);
				if (!valid) {
					throw new Error(
						`Mutating call blocked: ${data.method} requires a valid mutationId from propose_mutation, `
						+ 'confirmed by the user in an earlier turn. Call propose_mutation first with a summary of '
						+ 'this action, tell the user, and end your turn — do not call zoho_api again until their '
						+ 'next message, then retry with the returned mutationId.',
					);
				}
			}

			if (!deps.userId) {
				throw new Error('Not signed in — zoho_api requires a logged-in user.');
			}
			const token = await deps.getUserToken(deps.userId);
			const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
			if (data.body !== undefined) {
				headers['Content-Type'] = 'application/json';
			}
			// Merge caller-supplied headers (e.g. Zoho Desk's `orgId`) last, but never
			// let them override the bearer token or content type set above.
			for (const [key, value] of Object.entries(data.headers ?? {})) {
				const lower = key.toLowerCase();
				if (lower === 'authorization' || lower === 'content-type') continue;
				headers[key] = value;
			}

			// Follow redirects manually so each hop is validated against the
			// allowlist before the Authorization header is forwarded.
			let currentUrl = data.url;
			for (let hops = 0; hops <= config.zohoApiMaxRedirects; hops++) {
				const res = await fetch(currentUrl, {
					method: data.method,
					headers,
					body: data.body,
					signal,
					redirect: 'manual',
				});

				if (res.status >= 300 && res.status < 400) {
					const location = res.headers.get('location');
					if (!location) {
						return { output: { status: res.status, body: '' } };
					}
					// Resolve relative Location values against the current URL.
					const redirectUrl = new URL(location, currentUrl).toString();
					if (!isAllowedUrl(redirectUrl)) {
						throw new Error(
							`Redirect blocked: ${redirectUrl} is not under an allowed Zoho domain.`,
						);
					}
					currentUrl = redirectUrl;
					continue;
				}

				return { output: { status: res.status, body: truncateResponseBody(await res.text()) } };
			}

			throw new Error(`Too many redirects (max ${config.zohoApiMaxRedirects}).`);
		},
	});
}
