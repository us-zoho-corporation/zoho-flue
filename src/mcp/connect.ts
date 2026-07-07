import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type McpTransport = 'http' | 'sse';

export interface McpTarget {
	url: string;
	transport: McpTransport;
	authToken?: string | null;
}

export interface ProbedTool {
	name: string;
	description: string;
	inputSchema?: Record<string, unknown>;
}

export type ProbeResult =
	| { ok: true; tools: ProbedTool[] }
	| { ok: false; error: string };

const CONNECT_TIMEOUT_MS = 10_000;
const MAX_RESULT_CHARS = 12_000;
const BLOCKED_HOST = 'That host is not allowed.';

/**
 * True for an IPv4 address in a loopback / private / link-local / reserved range.
 * @param ip - Dotted-decimal IPv4 address to check.
 * @returns Whether the address falls in a private/reserved range (malformed input is treated as unsafe and returns true).
 */
function isPrivateV4(ip: string): boolean {
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → unsafe
	const [a, b] = parts;
	return (
		a === 0 ||            // 0.0.0.0/8
		a === 10 ||           // private
		a === 127 ||          // loopback
		(a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
		(a === 169 && b === 254) ||           // link-local / cloud metadata
		(a === 172 && b >= 16 && b <= 31) ||  // private /12
		(a === 192 && b === 168) ||           // private
		(a === 198 && (b === 18 || b === 19)) || // benchmarking
		a >= 224              // multicast / reserved / broadcast
	);
}

/**
 * True for any loopback / private / link-local / unique-local / mapped address.
 * @param ip - IPv4 or IPv6 address to check (a zone id suffix or surrounding brackets are stripped before checking).
 * @returns Whether the address (or, for an IPv4-mapped IPv6 address, its embedded IPv4 address) is loopback/private/link-local/unique-local.
 */
export function isPrivateIp(ip: string): boolean {
	const addr = ip.toLowerCase().replace(/%.*$/, '').replace(/^\[|\]$/g, ''); // strip zone id + brackets
	const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped IPv6
	if (mapped) return isPrivateV4(mapped[1]);
	if (addr.includes(':')) {
		if (addr === '::' || addr === '::1') return true; // unspecified / loopback
		if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA fc00::/7
		if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
		return false;
	}
	return isPrivateV4(addr);
}

/**
 * Synchronous, format-level guard used by input validation. The server connects
 * to this URL, so this is a first-line SSRF filter: HTTPS only; reject obvious
 * internal names and literal private/loopback IPs. Domain names are resolved and
 * re-checked at connect time (see {@link openClient}).
 * @param raw - The candidate MCP server URL, as entered by the user.
 * @returns A human-readable validation error message, or `null` if the URL passes this format-level check.
 */
export function validateMcpUrl(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return 'Enter a valid URL.';
	}
	if (u.protocol !== 'https:') return 'MCP server URL must use https://.';
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return BLOCKED_HOST;
	if (isIP(host) && isPrivateIp(host)) return BLOCKED_HOST;
	return null;
}

/**
 * Resolves the host and returns true if ANY resolved address is unsafe (SSRF/DNS-rebinding guard).
 * @param host - Hostname to resolve.
 * @returns Whether any resolved address is private/unsafe, or the lookup failed or returned no addresses (both treated as unsafe).
 */
async function resolvesToPrivate(host: string): Promise<boolean> {
	try {
		const results = await lookup(host, { all: true, verbatim: true });
		return results.length === 0 || results.some((r) => isPrivateIp(r.address));
	} catch {
		return true; // unresolvable → treat as unsafe
	}
}

/**
 * Builds the MCP SDK client transport for a target URL, attaching a bearer
 * auth header when a token is supplied and rejecting redirects so a public
 * URL can't redirect the request into an internal host.
 * @param url - Server URL to connect to.
 * @param transport - Which wire transport to use.
 * @param authToken - Optional bearer token to send as the Authorization header.
 * @returns A configured SSE or streamable-HTTP client transport.
 */
function makeTransport(url: URL, transport: McpTransport, authToken?: string | null) {
	const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
	// `redirect: 'error'` prevents a public URL from redirecting into an internal host.
	const requestInit: RequestInit = { headers, redirect: 'error' };
	if (transport === 'sse') {
		return new SSEClientTransport(url, {
			requestInit,
			eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, redirect: 'error', headers: { ...init?.headers, ...headers } }) },
		});
	}
	return new StreamableHTTPClientTransport(url, { requestInit });
}

/**
 * Opens a connected MCP client to a user-supplied target — the single guarded
 * entry point. Enforces the SSRF checks (format + DNS resolution) before
 * connecting, with a bounded timeout. The caller must `close()` the client.
 * @param target - The MCP server URL, transport, and optional auth token to connect to.
 * @returns A connected MCP client.
 * @throws {Error} If the URL fails format validation, resolves to a private/internal address, the connection attempt fails, or it doesn't complete within {@link CONNECT_TIMEOUT_MS}.
 */
async function openClient(target: McpTarget): Promise<Client> {
	const urlError = validateMcpUrl(target.url);
	if (urlError) throw new Error(urlError);
	if (await resolvesToPrivate(new URL(target.url).hostname)) throw new Error(BLOCKED_HOST);

	const client = new Client({ name: 'zoho-flue', version: '1.0.0' });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('Connection timed out.')), CONNECT_TIMEOUT_MS);
	});
	try {
		await Promise.race([client.connect(makeTransport(new URL(target.url), target.transport, target.authToken)), timeout]);
		return client;
	} catch (err) {
		try { await client.close(); } catch { /* ignore */ }
		throw err;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/**
 * Connects to an external MCP server and lists its tools — the "test connection"
 * primitive and the source for live tool discovery. Never throws.
 * @param target - The MCP server URL, transport, and optional auth token to probe.
 * @returns On success, the server's advertised tools; on failure, an error message describing why the connection or listing failed.
 */
export async function probeMcpServer(target: McpTarget): Promise<ProbeResult> {
	let client: Client | undefined;
	try {
		client = await openClient(target);
		const { tools } = await client.listTools();
		return {
			ok: true,
			tools: (tools ?? []).map((t) => ({
				name: t.name,
				description: t.description ?? '',
				inputSchema: (t.inputSchema ?? undefined) as Record<string, unknown> | undefined,
			})),
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	} finally {
		try { await client?.close(); } catch { /* ignore */ }
	}
}

/**
 * Flattens an MCP tool result's content into a single capped text string.
 * @param content - The tool result's `content` field: an array of content blocks, or any other value to stringify directly.
 * @returns The joined text of all text-bearing blocks (blank entries dropped), or `String(content)` if it isn't an array; truncated to {@link MAX_RESULT_CHARS} with a trailing marker if longer.
 */
export function mcpResultToText(content: unknown): string {
	if (!Array.isArray(content)) return String(content ?? '').slice(0, MAX_RESULT_CHARS);
	const text = content
		.map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : ''))
		.filter(Boolean)
		.join('\n\n');
	return text.length <= MAX_RESULT_CHARS ? text : text.slice(0, MAX_RESULT_CHARS) + '\n[truncated]';
}

/**
 * Calls a single tool on an external MCP server and returns its text output.
 * @param target - The MCP server URL, transport, and optional auth token to connect to.
 * @param name - Name of the tool to call.
 * @param args - Arguments to pass to the tool call.
 * @returns The tool result's content, flattened to text (see {@link mcpResultToText}).
 * @throws {Error} If the connection can't be established (see {@link openClient}) or the tool call itself fails.
 */
export async function callMcpTool(target: McpTarget, name: string, args: Record<string, unknown>): Promise<string> {
	let client: Client | undefined;
	try {
		client = await openClient(target);
		const result = await client.callTool({ name, arguments: args });
		return mcpResultToText(result.content);
	} finally {
		try { await client?.close(); } catch { /* ignore */ }
	}
}
