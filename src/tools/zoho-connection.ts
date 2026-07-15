import { config, type ZohoProduct } from '../config';
import { throwConnectionRequired } from './connection-required';

/** What a Zoho connection check needs: the current user and how to look up their granted scopes. */
export interface ZohoConnectionDeps {
	/** The logged-in user's id, or `undefined` outside a real request (e.g. `flue run` from the CLI). */
	userId: string | undefined;
	/** The scopes the user has granted so far (empty if they've never connected at all). */
	getGrantedScopes: (userId: string) => Promise<string[]>;
	/** Product scope bundles (crm/desk) — determines what's required for `product`. */
	products: readonly ZohoProduct[];
}

/**
 * Verifies the user has granted the full scope bundle for `product`, throwing
 * a `ConnectionRequiredPayload` if not. Shared by `check_zoho_connection` (a
 * cheap, instant check the model is instructed to make before touching a
 * product's skill docs or API) and `zoho_api` itself (the deterministic
 * backstop that's enforced regardless of whether the model checked first —
 * see `connection-required.ts` for why this needs to be real, thrown code
 * and not just a prompt instruction).
 * @param deps - The current user's id and scope accessor, plus the configured product scope bundles.
 * @param product - The Zoho product ('crm' or 'desk') the action needs.
 * @throws {Error} A `ConnectionRequiredPayload`-encoded error if the product's scope bundle isn't fully granted.
 */
export async function requireZohoConnection(deps: ZohoConnectionDeps, product: 'crm' | 'desk'): Promise<void> {
	const required = deps.products.find((p) => p.key === product);
	if (!required) return;

	const granted = deps.userId ? await deps.getGrantedScopes(deps.userId) : [];
	const grantedSet = new Set(granted);
	const missing = required.scopes.filter((s) => !grantedSet.has(s));
	if (missing.length === 0) return;

	// Scopes shared with the default login grant (e.g. ZohoCRM.org.READ,
	// requested of every user for the profile popup) don't count as evidence
	// of a deliberate prior connection — without excluding them, every user
	// would show as "reconnect" on their very first CRM call.
	const loginScopes = new Set(config.zohoLoginScopes.split(/[\s,]+/));
	const everConnected = required.scopes.some((s) => !loginScopes.has(s) && grantedSet.has(s));
	throwConnectionRequired({
		kind: 'zoho',
		mode: everConnected ? 'reconnect' : 'connect',
		label: required.label,
		product: required.key as 'crm' | 'desk',
		scopes: required.scopes,
	});
}
