import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export type McpTransport = 'http' | 'sse';

export interface ProbeOptions {
	url: string;
	transport: McpTransport;
	authToken?: string | null;
}

export interface ProbedTool {
	name: string;
	description: string;
}

export type ProbeResult =
	| { ok: true; tools: ProbedTool[] }
	| { ok: false; error: string };

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Validates a user-supplied MCP server URL. The server connects to this URL, so
 * this is an SSRF guard: HTTPS only, and no loopback / link-local / private hosts.
 * Returns an error string, or null when the URL is acceptable.
 */
export function validateMcpUrl(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return 'Enter a valid URL.';
	}
	if (u.protocol !== 'https:') return 'MCP server URL must use https://.';

	const host = u.hostname.toLowerCase();
	const isPrivate =
		host === 'localhost' ||
		host === '::1' ||
		host.endsWith('.localhost') ||
		host.endsWith('.internal') ||
		host.startsWith('127.') ||
		host.startsWith('10.') ||
		host.startsWith('192.168.') ||
		host.startsWith('169.254.') ||
		host.startsWith('0.') ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host); // private /12 block
	if (isPrivate) return 'That host is not allowed.';
	return null;
}

function makeTransport(url: URL, transport: McpTransport, authToken?: string | null) {
	const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
	if (transport === 'sse') {
		// Auth header applied to both the SSE stream request and the POST-back channel.
		return new SSEClientTransport(url, {
			...(headers ? { eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) } } : {}),
			...(headers ? { requestInit: { headers } } : {}),
		});
	}
	return new StreamableHTTPClientTransport(url, headers ? { requestInit: { headers } } : undefined);
}

/**
 * Connects to an external MCP server and lists its tools — the "test connection"
 * primitive. Never throws: connection/protocol failures come back as
 * `{ ok: false, error }`. Always closes the client.
 */
export async function probeMcpServer(opts: ProbeOptions): Promise<ProbeResult> {
	const urlError = validateMcpUrl(opts.url);
	if (urlError) return { ok: false, error: urlError };

	const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('Connection timed out.')), CONNECT_TIMEOUT_MS);
	});

	try {
		await Promise.race([
			client.connect(makeTransport(new URL(opts.url), opts.transport, opts.authToken)),
			timeout,
		]);
		const { tools } = await Promise.race([client.listTools(), timeout]);
		return {
			ok: true,
			tools: (tools ?? []).map((t) => ({ name: t.name, description: t.description ?? '' })),
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	} finally {
		if (timer) clearTimeout(timer);
		try { await client.close(); } catch { /* ignore */ }
	}
}
