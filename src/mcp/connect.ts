import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

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
const BLOCKED_HOST = 'That host is not allowed.';

/** True for an IPv4 address in a loopback / private / link-local / reserved range. */
function isPrivateV4(ip: string): boolean {
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → treat as unsafe
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

/** True for any loopback / private / link-local / unique-local / mapped address. */
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
 * re-checked at connect time (see {@link probeMcpServer}).
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

/** Resolves the host and returns true if ANY resolved address is unsafe (SSRF/DNS-rebinding guard). */
async function resolvesToPrivate(host: string): Promise<boolean> {
	try {
		// An IP literal is returned as-is (no DNS query); a name is fully resolved.
		const results = await lookup(host, { all: true, verbatim: true });
		return results.length === 0 || results.some((r) => isPrivateIp(r.address));
	} catch {
		return true; // unresolvable → treat as unsafe
	}
}

function makeTransport(url: URL, transport: McpTransport, authToken?: string | null) {
	const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
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
 * Connects to an external MCP server and lists its tools — the "test connection"
 * primitive and the single guarded entry point for reaching a user-supplied URL.
 * Never throws: failures come back as `{ ok: false, error }`. Always closes.
 */
export async function probeMcpServer(opts: ProbeOptions): Promise<ProbeResult> {
	const urlError = validateMcpUrl(opts.url);
	if (urlError) return { ok: false, error: urlError };

	// DNS-resolve and re-check every address (defeats names that point at private
	// IPs, e.g. the cloud metadata endpoint) before we open any connection.
	if (await resolvesToPrivate(new URL(opts.url).hostname)) return { ok: false, error: BLOCKED_HOST };

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
