import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { config } from '../config';

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
 * Returns a tool for making authenticated Zoho API calls. The token lives in
 * a closure and is never exposed to the model — only the URL, method, and
 * optional body are model-selected inputs.
 */
export function defineZohoApiTool(token: string) {
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
		async run({ input, signal }) {
			if (!isAllowedUrl(input.url)) {
				throw new Error(
					`Request blocked: ${input.url} is not under an allowed Zoho domain (${config.zohoAllowedHostnames.join(', ')}).`,
				);
			}
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
