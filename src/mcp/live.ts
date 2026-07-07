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
/**
 * Lazily parses the configured data-encryption keyring and caches it in module
 * state so subsequent calls skip re-parsing.
 * @returns The parsed keyring used to decrypt stored MCP server auth tokens.
 * @throws {Error} If `config.dataEncryptionKey` is empty or malformed (see {@link parseKeyring}).
 */
const keyring = (): Keyring => (_keyring ??= parseKeyring(config.dataEncryptionKey));

/**
 * Looks up the cached tool list for an MCP server, probing the server over the
 * network on a cache miss or once {@link DISCOVERY_TTL_MS} has elapsed (or if the
 * server's URL has changed since the cached entry). A failed probe is cached as
 * an empty tool list.
 * @param server - The MCP server record to discover tools for.
 * @param authToken - Decrypted bearer token to authenticate the probe, or null if the server has none.
 * @returns The list of tools the server exposes (empty if discovery failed).
 */
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
 * @param userId - Id of the user whose enabled MCP servers should be loaded.
 * @returns The Flue-compatible tools built from all successfully discovered servers.
 * @throws {Error} If the data-encryption keyring is misconfigured or a stored auth token fails to decrypt.
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
