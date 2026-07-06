import { defineAgent, defineAgentProfile, type AgentRouteHandler } from '@flue/runtime';
import { config } from '../config';
import { defineZohoApiTool } from '../tools/zoho-api';
import { a2uiTools } from '../tools/a2ui';
import { zohoKbTools } from '../mcp/zoho-kb';
import { getAuth } from '../auth';
import { currentMcpTools, runWithRequestContext } from '../auth/request-context';
import { loadUserMcpTools } from '../mcp/live';
import { CATALYST_GLM_API } from '../providers/catalyst-glm';

// Tools hold these credentials in a closure; the model only ever sees parameter names.
const oauth = {
	clientId: config.zohoClientId,
	clientSecret: config.zohoClientSecret,
	refreshToken: config.zohoRefreshToken,
};

// The assistant's behavior — tools + instructions — is single-sourced here. Only
// the model varies between conversations, so it is NOT part of the identity.
const zohoAssistant = defineAgentProfile({
	tools: [defineZohoApiTool(oauth), ...a2uiTools, ...(config.zohoDocsBearerToken ? zohoKbTools : [])],
	instructions:
		'You are a Zoho product assistant. For questions about Zoho products (features, '
		+ 'configuration, APIs, troubleshooting), use zoho_kb_search to find the relevant '
		+ 'documentation, then answer directly and concisely from what you found. Refine and '
		+ 'search again only if the first results fall short, and use zoho_kb_get_page when you '
		+ 'need an article’s full text. Ground your answer in the documentation and cite source URLs.\n\n'
		+ 'Always finish every turn with a written answer in plain text. Never end a turn on a '
		+ 'tool call: after any search or visualization, continue and write the answer.\n\n'
		+ 'Search budget: use at most 3-4 zoho_kb_search calls per question, varying the wording. '
		+ 'If the documentation does not contain the answer after a few tries, stop searching and '
		+ 'say plainly that you could not find it in the available Zoho documentation, give your '
		+ 'best general guidance, and point the user to the official docs (e.g. developer.zoho.com). '
		+ 'A clear "I could not find this" is a valid, required answer — never end the turn still searching.\n\n'
		+ 'Visualize proactively whenever a picture communicates faster than prose:\n'
		+ '- comparing options/plans/editions across attributes → render_comparison_table;\n'
		+ '- comparing quantities across categories, a trend over time, or parts of a whole → '
		+ 'render_chart (bar / line or area / pie);\n'
		+ '- a few headline metrics or KPIs → render_stat_cards.\n'
		+ 'If you are about to list three or more numbers, dates, or compared items, render a '
		+ 'visualization instead of a wall of text, then add a short written takeaway (2-4 sentences) '
		+ 'that interprets it. Use at most one or two visualizations per answer, and skip them for '
		+ 'simple factual, yes/no, or how-to answers. Keep all figures grounded in the documentation you cite.',
});

/**
 * Resolve the provider-model for a conversation from its instance id. The chat
 * encodes the chosen model as a `<key>__<uuid>` prefix; unknown/absent prefixes
 * fall back to the configured default (`anthropic/claude-sonnet-5`). This makes
 * the provider-model a per-conversation selectable option on one assistant,
 * rather than a dedicated agent per model.
 */
export function modelForConversation(id: string): string {
	const key = id.includes('__') ? id.slice(0, id.indexOf('__')) : '';
	const chosen = config.chatModels.find((m) => m.key === key)
		?? config.chatModels.find((m) => m.key === config.defaultChatModelKey)
		?? config.chatModels[0];
	return chosen.spec;
}

// Before running a turn, populate the request context for the logged-in user:
//  - GLM conversations get the user's Zoho token (carries QuickML.deployment.READ)
//    so the provider calls the endpoint as the user;
//  - any conversation gets the user's connected MCP servers' tools, injected into
//    the agent below.
// Guests get neither (service token / no MCP tools).
export const route: AgentRouteHandler = async (c, next) => {
	const auth = getAuth();
	const userId = await auth.resolveUserId(c).catch(() => null);
	if (!userId) return next();

	const id = decodeURIComponent(c.req.path.split('/').pop() ?? '');
	const isGlm = modelForConversation(id).startsWith(`${CATALYST_GLM_API}/`);
	const [userToken, mcpTools] = await Promise.all([
		isGlm ? auth.getUserToken(userId).catch(() => undefined) : Promise.resolve(undefined),
		loadUserMcpTools(userId).catch(() => []),
	]);
	return runWithRequestContext({ userToken, mcpTools }, () => next());
};

export default defineAgent(({ id }) => {
	// Per-conversation profile: the fixed assistant plus the logged-in user's
	// connected MCP tools (from the request context set in `route`, if any).
	const mcp = (currentMcpTools() ?? []) as NonNullable<typeof zohoAssistant.tools>;
	const profile = mcp.length
		? { ...zohoAssistant, tools: [...(zohoAssistant.tools ?? []), ...mcp] }
		: zohoAssistant;
	return { profile, model: modelForConversation(id) };
});
