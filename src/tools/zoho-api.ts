import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';
import { getZohoAccessToken, type OAuthCredentials } from '../auth/zoho-auth';

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
 * @returns A Flue tool named `zoho_api` that performs the authenticated HTTP request.
 */
export function defineZohoApiTool(oauth: OAuthCredentials) {
	return defineTool({
		name: 'zoho_api',
		description: 'Make an authenticated HTTP request to a Zoho API endpoint.',
		input: v.object({
			method: v.picklist(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
			url: v.pipe(v.string(), v.description('Full Zoho API URL')),
			body: v.optional(v.string()),
		}),
		output: v.object({
			status: v.number(),
			body: v.string(),
		}),
		/**
		 * Executes the authenticated Zoho API request, validating the target URL (and any
		 * redirect hops) against `config.zohoAllowedHostnames` before attaching the bearer token.
		 * @param input - The requested method, target URL, and optional request body.
		 * @param signal - Abort signal forwarded to the underlying `fetch` call.
		 * @returns The final response's HTTP status and body text.
		 * @throws {Error} If the URL (or a redirect target) is not under an allowed Zoho domain,
		 * or if the number of redirect hops exceeds `config.zohoApiMaxRedirects`.
		 */
		async run({ input, signal }) {
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
