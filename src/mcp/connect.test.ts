import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked MCP SDK client + DNS resolver shared across tests.
const ctl = vi.hoisted(() => ({
	connect: vi.fn(async () => {}),
	listTools: vi.fn(async () => ({ tools: [] as { name: string; description?: string }[] })),
	closed: false,
}));
const dns = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		connect() { return ctl.connect(); }
		listTools() { return ctl.listTools(); }
		async close() { ctl.closed = true; }
	},
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class {} }));
vi.mock('node:dns/promises', () => ({ lookup: dns.lookup }));

const { probeMcpServer, validateMcpUrl, isPrivateIp } = await import('./connect');

beforeEach(() => {
	ctl.connect.mockReset().mockResolvedValue(undefined);
	ctl.listTools.mockReset().mockResolvedValue({ tools: [] });
	ctl.closed = false;
	dns.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('isPrivateIp', () => {
	it('flags loopback/private/link-local IPv4, IPv6, and mapped addresses', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.169.254', '172.16.5.5', '100.64.0.1', '0.0.0.0']) {
			expect(isPrivateIp(ip)).toBe(true);
		}
		for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1']) {
			expect(isPrivateIp(ip)).toBe(true);
		}
		expect(isPrivateIp('93.184.216.34')).toBe(false);
		expect(isPrivateIp('2606:2800:220:1::1')).toBe(false);
	});
});

describe('validateMcpUrl', () => {
	it('accepts a normal https host', () => {
		expect(validateMcpUrl('https://mcp.example.com/mcp')).toBeNull();
	});
	it('rejects non-https, internal names, and literal private IPs (v4 + v6)', () => {
		expect(validateMcpUrl('http://mcp.example.com')).toMatch(/https/);
		expect(validateMcpUrl('not a url')).toBeTruthy();
		expect(validateMcpUrl('https://localhost/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://api.internal/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://127.0.0.1/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://169.254.169.254/latest')).toBeTruthy();
		expect(validateMcpUrl('https://[::1]/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://[fd00::1]/mcp')).toBeTruthy();
	});
});

describe('probeMcpServer', () => {
	it('returns the server tools on success and closes the client', async () => {
		ctl.listTools.mockResolvedValue({ tools: [{ name: 'search', description: 'Search docs' }, { name: 'get' }] });
		const res = await probeMcpServer({ url: 'https://mcp.example.com/mcp', transport: 'http', authToken: 'tok' });
		expect(res).toEqual({ ok: true, tools: [{ name: 'search', description: 'Search docs' }, { name: 'get', description: '' }] });
		expect(ctl.closed).toBe(true);
	});

	it('rejects a hostname that DNS-resolves to a private IP, without connecting', async () => {
		dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
		const res = await probeMcpServer({ url: 'https://rebind.example.com/mcp', transport: 'http' });
		expect(res.ok).toBe(false);
		expect(ctl.connect).not.toHaveBeenCalled();
	});

	it('returns an error (not throws) when the connection fails', async () => {
		ctl.connect.mockRejectedValue(new Error('ECONNREFUSED'));
		const res = await probeMcpServer({ url: 'https://mcp.example.com/mcp', transport: 'http' });
		expect(res).toEqual({ ok: false, error: 'ECONNREFUSED' });
		expect(ctl.closed).toBe(true);
	});

	it('rejects a disallowed literal URL before resolving or connecting', async () => {
		const res = await probeMcpServer({ url: 'http://localhost/mcp', transport: 'http' });
		expect(res.ok).toBe(false);
		expect(dns.lookup).not.toHaveBeenCalled();
		expect(ctl.connect).not.toHaveBeenCalled();
	});
});
