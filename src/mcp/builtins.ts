import { config } from '../config';

/**
 * App-owned MCP servers wired into the assistant in code (not per-user store
 * records). Surfaced on the MCP servers page as read-only rows so users can see
 * what's connected out of the box. Their credentials come from the environment,
 * so they can't be edited, disabled, or deleted from the UI.
 */
export interface BuiltinMcpServer {
	id: string;
	name: string;
	url: string;
	transport: 'http' | 'sse';
	hasAuth: boolean;
}

/**
 * Lists the built-in servers that are currently active, based on whether the
 * environment configuration each one needs is present.
 * @returns The active built-in MCP servers to surface as read-only rows on
 * the MCP servers page.
 */
export function builtinMcpServers(): BuiltinMcpServer[] {
	const list: BuiltinMcpServer[] = [];
	// The Zoho KB client (src/mcp/zoho-kb.ts) is only wired in when the docs
	// OAuth client is configured. Auth itself is per-user (see
	// src/auth/docs-oauth.ts), not a single app-wide credential — `hasAuth`
	// here just reflects "the feature is enabled at all".
	if (config.docsOauthClientId) {
		list.push({
			id: 'builtin:zoho-kb',
			name: 'Zoho Knowledge Base',
			url: config.zohoDocsMcpUrl,
			transport: 'http',
			hasAuth: true,
		});
	}
	return list;
}
