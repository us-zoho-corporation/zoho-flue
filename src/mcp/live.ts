import { config } from '../config';
import { decryptSecret, parseKeyring, type Keyring } from '../auth/crypto';
import { getStores } from '../store';
import type { McpServer } from '../store/types';
import { probeMcpServer, type ProbedTool } from './connect';
import { buildMcpTools, type LoadedServer } from './tools';

// Discovering a server's tools requires a network round-trip, so cache the tool
// list per server briefly to avoid reconnecting on every message.
const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; url: string; tools: ProbedTool[] }>();

let _keyring: Keyring | undefined;
const keyring = (): Keyring => (_keyring ??= parseKeyring(config.dataEncryptionKey));

async function discover(server: McpServer, authToken: string | null): Promise<ProbedTool[]> {
	const hit = cache.get(server.id);
	if (hit && hit.url === server.url && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.tools;
	const res = await probeMcpServer({ url: server.url, transport: server.transport, authToken });
	const tools = res.ok ? res.tools : [];
	cache.set(server.id, { at: Date.now(), url: server.url, tools });
	return tools;
}

/**
 * Discovers and builds the Flue tools for a user's *enabled* MCP servers. Used by
 * the assistant route to inject the tools into the conversation. Failures per
 * server are swallowed (that server contributes no tools) so one bad connection
 * never breaks the turn.
 */
export async function loadUserMcpTools(userId: string): Promise<ReturnType<typeof buildMcpTools>> {
	const servers = (await getStores().mcpServers.listForUser(userId)).filter((s) => s.enabled);
	const loaded: LoadedServer[] = [];
	await Promise.all(servers.map(async (server) => {
		const authToken = server.authTokenEnc ? decryptSecret(server.authTokenEnc, keyring()) : null;
		const tools = await discover(server, authToken).catch(() => []);
		if (tools.length) loaded.push({ server, authToken, tools });
	}));
	return buildMcpTools(loaded);
}
