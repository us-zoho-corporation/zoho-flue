import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';
import { getZohoAccessToken, type OAuthCredentials } from '../auth/zoho-auth';
import { consumeMutation, isMutatingMethod } from './mutation-gate';

/** Per-turn context the mutation confirmation gate needs (see `mutation-gate.ts`). */
export interface MutationGateContext {
	conversationId: string;
	requestId: string;
	/** When `true` ("Auto mode"), the gate is bypassed entirely — no `mutationId` required. */
	autoApprove: boolean;
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
 * Returns a tool for making authenticated Zoho API calls. Credentials live in
 * a closure; the token is refreshed on every call via the shared token cache so
 * it never goes stale after the boot-time token expires.
 * @param oauth - Zoho OAuth client credentials used to mint/refresh the bearer token.
 * @param gate - This turn's mutation-confirmation context. Unless `autoApprove`,
 * every mutating call must carry a `mutationId` minted by `propose_mutation` in
 * an earlier turn — this is enforced here, not left to the model's judgment.
 * @returns A Flue tool named `zoho_api` that performs the authenticated HTTP request.
 */
export function defineZohoApiTool(oauth: OAuthCredentials, gate: MutationGateContext) {
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
		 * Executes the authenticated Zoho API request. Mutating methods are rejected unless
		 * `gate.autoApprove` is set or `input.mutationId` is a valid, not-same-turn id from
		 * `propose_mutation`. The (allowed) URL — and any redirect hops — is then validated
		 * against `config.zohoAllowedHostnames` before attaching the bearer token.
		 * @param input - The requested method, target URL, optional request body, optional
		 * extra headers (e.g. Zoho Desk's `orgId`), and — for mutating methods — the
		 * confirmation `mutationId`.
		 * @param signal - Abort signal forwarded to the underlying `fetch` call.
		 * @returns The final response's HTTP status and body text.
		 * @throws {Error} If a mutating call lacks a valid `mutationId`, if the URL (or a
		 * redirect target) is not under an allowed Zoho domain, or if the number of redirect
		 * hops exceeds `config.zohoApiMaxRedirects`.
		 */
		async run({ input, signal }) {
			if (isMutatingMethod(input.method) && !gate.autoApprove) {
				const valid = !!input.mutationId && consumeMutation(gate.conversationId, input.mutationId, gate.requestId);
				if (!valid) {
					throw new Error(
						`Mutating call blocked: ${input.method} requires a valid mutationId from propose_mutation, `
						+ 'confirmed by the user in an earlier turn. Call propose_mutation first with a summary of '
						+ 'this action, tell the user, and end your turn — do not call zoho_api again until their '
						+ 'next message, then retry with the returned mutationId.',
					);
				}
			}
			if (!isAllowedUrl(input.url)) {
				throw new Error(
					`Request blocked: ${input.url} is not under an allowed Zoho domain (${config.zohoAllowedHostnames.join(', ')}).`,
				);
			}
			const token = await getZohoAccessToken(oauth);
			const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
			if (input.body !== undefined) {
				headers['Content-Type'] = 'application/json';
			}
			// Merge caller-supplied headers (e.g. Zoho Desk's `orgId`) last, but never
			// let them override the bearer token or content type set above.
			for (const [key, value] of Object.entries(input.headers ?? {})) {
				const lower = key.toLowerCase();
				if (lower === 'authorization' || lower === 'content-type') continue;
				headers[key] = value;
			}

			// Follow redirects manually so each hop is validated against the
			// allowlist before the Authorization header is forwarded.
			let currentUrl = input.url;
			for (let hops = 0; hops <= config.zohoApiMaxRedirects; hops++) {
				const res = await fetch(currentUrl, {
					method: input.method,
					headers,
					body: input.body,
					signal,
					redirect: 'manual',
				});

				if (res.status >= 300 && res.status < 400) {
					const location = res.headers.get('location');
					if (!location) {
						return { status: res.status, body: '' };
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

				return { status: res.status, body: await res.text() };
			}

			throw new Error(`Too many redirects (max ${config.zohoApiMaxRedirects}).`);
		},
	});
}
