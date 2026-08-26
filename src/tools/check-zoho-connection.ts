import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { requireZohoConnection, type ZohoConnectionDeps } from './zoho-connection';

/**
 * Returns a cheap, instant tool for checking whether the user has connected
 * a Zoho product with the scopes it needs, before spending turns on skill
 * lookups or an API call doomed to fail. Calling `zoho_api` for a
 * disconnected product would eventually hit the same gate (it's enforced
 * there too, deterministically, regardless of whether this was called
 * first), but only after the model has already spent a turn searching skill
 * docs and another attempting the request — this exists purely to let the
 * model discover "not connected" in one cheap step instead.
 * @param deps - The current user's id and scope accessor, plus the configured product scope bundles.
 * @returns A Flue tool named `check_zoho_connection`.
 */
export function defineCheckZohoConnectionTool(deps: ZohoConnectionDeps) {
	return defineTool({
		name: 'check_zoho_connection',
		description:
			'Cheap, instant check for whether the user has connected Zoho CRM or Desk with the scopes '
			+ 'a request needs. Call this FIRST — before zoho_skill_get or zoho_api — for any request '
			+ 'that touches Zoho CRM or Desk records/settings, so a missing connection is discovered in '
			+ 'one step instead of after searching skill docs and attempting the call. Throws if not '
			+ 'connected: stop immediately, say so in one short line, and do not call zoho_skill_get or '
			+ 'zoho_api for that product this turn — a Connect/Reconnect button appears in the chat '
			+ 'automatically. Returns normally once connected — proceed with the request right away.',
		input: v.object({
			product: v.picklist(['crm', 'desk']),
		}),
		output: v.object({
			connected: v.boolean(),
		}),
		/**
		 * Checks the user's connection for `data.product`.
		 * @param data - The Zoho product to check.
		 * @returns `{ connected: true }` if the product's full scope bundle is granted.
		 * @throws {Error} A `ConnectionRequiredPayload`-encoded error (see `connection-required.ts`) if not.
		 */
		async run({ data }) {
			await requireZohoConnection(deps, data.product);
			return { output: { connected: true } };
		},
	});
}
