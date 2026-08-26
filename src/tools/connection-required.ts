/**
 * A tool that depends on a connection the user hasn't granted (or has an
 * outdated grant for) throws one of these, encoded into the thrown `Error`'s
 * message, so the chat UI can render a Connect/Reconnect affordance instead
 * of a generic failure. Flue carries a thrown error's message through as
 * `errorText` on the resulting `output-error` tool-call part — see
 * `src/chat/src/flue-model.ts` for the client-side counterpart of this parse.
 */
export interface ConnectionRequiredPayload {
	/** Which connection family this is — determines how the chat's "Connect" button behaves. */
	kind: 'zoho' | 'mcp' | 'docs';
	/** Never connected at all vs. connected but missing scopes/otherwise stale. */
	mode: 'connect' | 'reconnect';
	/** Human-readable name shown in the card, e.g. "Zoho CRM" or the MCP server's name. */
	label: string;
	/** The Zoho product this call needed, when `kind` is `'zoho'`. */
	product?: 'crm' | 'desk';
	/** The full scope bundle required for `product`, so the Connect button can request exactly these. */
	scopes?: string[];
	/** The MCP server id to reconnect, when `kind` is `'mcp'`. */
	serverId?: string;
}

const SENTINEL = '__connection_required__:';

/**
 * Throws a `ConnectionRequiredPayload`, encoded into an `Error`'s message.
 * @param payload - The connection-required details to encode.
 * @throws {Error} Always — the thrown error's message is `payload`, JSON-encoded behind a sentinel prefix.
 */
export function throwConnectionRequired(payload: ConnectionRequiredPayload): never {
	throw new Error(SENTINEL + JSON.stringify(payload));
}

/**
 * Parses a tool-call error message back into a `ConnectionRequiredPayload`,
 * if it was produced by {@link throwConnectionRequired}.
 * @param message - The error message to parse (e.g. a tool step's `errorText`).
 * @returns The decoded payload, or `null` if `message` isn't one of these (absent, or an ordinary error).
 */
export function parseConnectionRequired(message: string | undefined | null): ConnectionRequiredPayload | null {
	if (!message || !message.startsWith(SENTINEL)) return null;
	try {
		return JSON.parse(message.slice(SENTINEL.length)) as ConnectionRequiredPayload;
	} catch {
		return null;
	}
}
