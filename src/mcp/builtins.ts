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

/** The built-in servers that are currently active (i.e. their env config is present). */
export function builtinMcpServers(): BuiltinMcpServer[] {
	const list: BuiltinMcpServer[] = [];
	// The Zoho KB client (src/mcp/zoho-kb.ts) is only wired in when its token is set.
	if (config.zohoDocsBearerToken) {
		list.push({
			id: 'builtin:zoho-kb',
			name: 'Zoho Knowledge Base',
			url: 'https://help-docs.zoho-forge.com/mcp',
			transport: 'http',
			hasAuth: true,
		});
	}
	return list;
}
