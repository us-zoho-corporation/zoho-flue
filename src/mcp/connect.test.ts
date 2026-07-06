import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared control for the mocked MCP SDK client.
const ctl = vi.hoisted(() => ({
	connect: vi.fn(async () => {}),
	listTools: vi.fn(async () => ({ tools: [] as { name: string; description?: string }[] })),
	closed: false,
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		connect() { return ctl.connect(); }
		listTools() { return ctl.listTools(); }
		async close() { ctl.closed = true; }
	},
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class {} }));

const { probeMcpServer, validateMcpUrl } = await import('./connect');

beforeEach(() => {
	ctl.connect.mockReset().mockResolvedValue(undefined);
	ctl.listTools.mockReset().mockResolvedValue({ tools: [] });
	ctl.closed = false;
});

describe('validateMcpUrl', () => {
	it('accepts a normal https host', () => {
		expect(validateMcpUrl('https://mcp.example.com/mcp')).toBeNull();
	});
	it('rejects non-https and private/loopback hosts (SSRF guard)', () => {
		expect(validateMcpUrl('http://mcp.example.com')).toMatch(/https/);
		expect(validateMcpUrl('not a url')).toBeTruthy();
		expect(validateMcpUrl('https://localhost/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://127.0.0.1/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://10.0.0.5/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://192.168.1.9/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://169.254.1.1/mcp')).toBeTruthy();
		expect(validateMcpUrl('https://172.16.0.1/mcp')).toBeTruthy();
	});
});

describe('probeMcpServer', () => {
	it('returns the server tools on success and closes the client', async () => {
		ctl.listTools.mockResolvedValue({ tools: [{ name: 'search', description: 'Search docs' }, { name: 'get' }] });
		const res = await probeMcpServer({ url: 'https://mcp.example.com/mcp', transport: 'http', authToken: 'tok' });
		expect(res).toEqual({ ok: true, tools: [{ name: 'search', description: 'Search docs' }, { name: 'get', description: '' }] });
		expect(ctl.closed).toBe(true);
	});

	it('returns an error (not throws) when the connection fails', async () => {
		ctl.connect.mockRejectedValue(new Error('ECONNREFUSED'));
		const res = await probeMcpServer({ url: 'https://mcp.example.com/mcp', transport: 'http' });
		expect(res).toEqual({ ok: false, error: 'ECONNREFUSED' });
		expect(ctl.closed).toBe(true);
	});

	it('rejects a disallowed URL before connecting', async () => {
		const res = await probeMcpServer({ url: 'http://localhost/mcp', transport: 'http' });
		expect(res.ok).toBe(false);
		expect(ctl.connect).not.toHaveBeenCalled();
	});
});
