import { defineAgent, defineAgentProfile, type AgentRouteHandler } from '@flue/runtime';
import { config } from '../config';
import { defineZohoApiTool } from '../tools/zoho-api';
import { zohoSkillTools } from '../tools/zoho-skills';
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
	tools: [defineZohoApiTool(oauth), ...zohoSkillTools, ...a2uiTools, ...(config.zohoDocsBearerToken ? zohoKbTools : [])],
	instructions:
		'You are a Zoho product assistant. For questions about Zoho products (features, '
		+ 'configuration, APIs, troubleshooting), use zoho_kb_search to find the relevant '
		+ 'documentation, then answer directly and concisely from what you found. Refine and '
		+ 'search again only if the first results fall short, and use zoho_kb_get_page when you '
		+ 'need an article’s full text. Ground your answer in the documentation and cite source URLs.\n\n'
		+ 'You can also *run* a Zoho CRM or Desk implementation for the user, not just describe one. '
		+ 'When asked to start, continue, or perform CRM/Desk setup work (create/inspect modules, '
		+ 'fields, records, workflow rules, tickets, departments, agents, etc.), use zoho_skill_get to '
		+ 'load the relevant operation\'s exact endpoint, parameters, and scopes before calling zoho_api '
		+ '— never guess a Zoho endpoint from memory. Available skills:\n'
		+ '- zoho-crm-records, zoho-crm-modules-and-fields, zoho-crm-query, zoho-crm-bulk-operations, '
		+ 'zoho-crm-record-actions, zoho-crm-related-records, zoho-crm-attachments, zoho-crm-emails, '
		+ 'zoho-crm-users-and-org, zoho-crm-workflow-automation (CRM v8 REST API)\n'
		+ '- zoho-desk-organizations, zoho-desk-tickets, zoho-desk-accounts, zoho-desk-contacts, '
		+ 'zoho-desk-agents-and-departments (Desk v1 REST API)\n'
		+ 'For any Desk call, first load zoho-desk-organizations and resolve `orgId` once per '
		+ 'conversation, then pass it as `headers: { orgId }` on every subsequent zoho_api call to '
		+ 'desk.zoho.com. Before making any mutating call (zoho_api with POST, PUT, PATCH, or DELETE), '
		+ 'summarize exactly what will be created/changed/deleted and get explicit user confirmation '
		+ '— never execute a mutation the user has not approved in this turn or a prior one.\n\n'
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
 * @param id - The conversation/instance id, optionally prefixed with `<key>__`.
 * @returns The Flue model specifier (`<provider>/<model>`) to use for this conversation.
 */
export function modelForConversation(id: string): string {
	const key = id.includes('__') ? id.slice(0, id.indexOf('__')) : '';
	const chosen = config.chatModels.find((m) => m.key === key)
		?? config.chatModels.find((m) => m.key === config.defaultChatModelKey)
		?? config.chatModels[0];
	return chosen.spec;
}

/**
 * Before running a turn, populates the request context for the logged-in user:
 *  - GLM conversations get the user's Zoho token (carries QuickML.deployment.READ)
 *    so the provider calls the endpoint as the user;
 *  - any conversation gets the user's connected MCP servers' tools, injected into
 *    the agent below.
 * Guests get neither (service token / no MCP tools); the handler falls through
 * to `next()` unchanged in that case.
 * @param c - The Flue agent route context, used to resolve the current user and conversation id.
 * @param next - The downstream handler to invoke, wrapped with the resolved request context.
 * @returns The result of calling `next()`, either directly (no user) or inside
 * `runWithRequestContext` (logged-in user).
 */
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

/**
 * Builds this conversation's agent definition: the shared `zohoAssistant` profile
 * (Zoho API tool, a2ui visualization tools, and optional KB tools/instructions),
 * augmented with any MCP tools the logged-in user has connected (set on the request
 * context by `route`), and resolved to the model chosen for this conversation id.
 * @param id - The conversation/instance id, passed through to `modelForConversation`.
 * @returns The agent's `{ profile, model }` for this conversation.
 */
export default defineAgent(({ id }) => {
	// Per-conversation profile: the fixed assistant plus the logged-in user's
	// connected MCP tools (from the request context set in `route`, if any).
	const mcp = (currentMcpTools() ?? []) as NonNullable<typeof zohoAssistant.tools>;
	const profile = mcp.length
		? { ...zohoAssistant, tools: [...(zohoAssistant.tools ?? []), ...mcp] }
		: zohoAssistant;
	return { profile, model: modelForConversation(id) };
});
