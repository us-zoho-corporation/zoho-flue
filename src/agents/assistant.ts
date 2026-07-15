import { defineAgent, defineAgentProfile, type AgentRouteHandler } from '@flue/runtime';
import { config } from '../config';
import { defineZohoApiTool, type ZohoApiDeps } from '../tools/zoho-api';
import { defineCheckZohoConnectionTool } from '../tools/check-zoho-connection';
import { defineProposeMutationTool } from '../tools/propose-mutation';
import { defineRequestInputTool } from '../tools/request-input';
import { zohoSkillTools } from '../tools/zoho-skills';
import { a2uiTools } from '../tools/a2ui';
import { zohoKbTools } from '../mcp/zoho-kb';
import { getAuth } from '../auth';
import { currentTurnContext, runWithRequestContext, setTurnContext } from '../auth/request-context';
import { loadUserMcpTools } from '../mcp/live';
import { CATALYST_GLM_API } from '../providers/catalyst-glm';
import { getStores } from '../store';

// The assistant's behavior — tools + instructions — is single-sourced here. Only
// the model varies between conversations, so it is NOT part of the identity.
// `zoho_api` (and `propose_mutation`, when confirmation is required) are
// deliberately NOT included here: both are rebuilt fresh per turn in
// `defineAgent` below, bound to that turn's mutation-gate context, so the
// confirmation requirement can't go stale or be bypassed by stale closures.
const zohoAssistant = defineAgentProfile({
	tools: [...zohoSkillTools, ...a2uiTools, defineRequestInputTool(), ...(config.zohoDocsBearerToken ? zohoKbTools : [])],
	instructions:
		'You are a Zoho product assistant. For questions about Zoho products (features, '
		+ 'configuration, APIs, troubleshooting), use zoho_kb_search to find the relevant '
		+ 'documentation, then answer directly and concisely from what you found. Refine and '
		+ 'search again only if the first results fall short, and use zoho_kb_get_page when you '
		+ 'need an article’s full text. Ground your answer in the documentation and cite source URLs.\n\n'
		+ 'You can also *run* a Zoho CRM or Desk implementation for the user, not just describe one. '
		+ 'When asked to start, continue, or perform CRM/Desk setup work (create/inspect modules, '
		+ 'fields, records, workflow rules, tickets, departments, agents, etc.):\n'
		+ '1. Call check_zoho_connection for the relevant product (crm or desk) FIRST, before anything '
		+ 'else. If it throws, the user hasn\'t connected that product (or their connection is missing '
		+ 'scopes) — say so in ONE short line and stop; do not call zoho_skill_get or zoho_api for it, '
		+ 'a Connect/Reconnect button appears in the chat automatically, and do not explain how to '
		+ 'connect yourself, the button already does that. This check is cheap and instant — always '
		+ 'call it fresh on EVERY turn that touches CRM/Desk, with no exception, even if you already '
		+ 'concluded "not connected" earlier in this same conversation — that earlier result can go '
		+ 'stale the moment the user connects, and answering from memory of it instead of actually '
		+ 'calling the tool again is exactly the failure this exists to prevent. This applies whether '
		+ 'the user clicks the Connect/Reconnect button\'s own follow-up or just asks again in their '
		+ 'own words — either way, call check_zoho_connection again before saying anything about '
		+ 'connection status, and proceed with the original request immediately once it succeeds, do '
		+ 'not ask the user to repeat themselves.\n'
		+ '2. Once connected, use zoho_skill_get to load the relevant operation\'s exact endpoint, '
		+ 'parameters, and scopes before calling zoho_api — never guess a Zoho endpoint from memory, '
		+ 'and never guess a picklist field\'s value (Stage, Pipeline, Lead_Source, Industry, etc.) — '
		+ 'these are customized per org/layout with no universal default, and Zoho rejects any value '
		+ 'the org hasn\'t actually configured. The zoho-crm-modules-and-fields skill\'s Get Layouts (and, '
		+ 'for Deals\' Pipeline/Stage specifically, Get Pipelines too) has the real values — check it '
		+ 'before creating or updating a record with one, especially when you\'re inventing the data '
		+ 'yourself (e.g. a sample/dummy record) rather than reflecting a value the user gave you. '
		+ 'Available skills:\n'
		+ '- zoho-crm-records, zoho-crm-modules-and-fields, zoho-crm-query, zoho-crm-bulk-operations, '
		+ 'zoho-crm-record-actions, zoho-crm-related-records, zoho-crm-attachments, zoho-crm-emails, '
		+ 'zoho-crm-users-and-org, zoho-crm-workflow-automation (CRM v8 REST API)\n'
		+ '- zoho-desk-organizations, zoho-desk-tickets, zoho-desk-accounts, zoho-desk-contacts, '
		+ 'zoho-desk-agents-and-departments (Desk v1 REST API)\n'
		+ 'For any Desk call, first load zoho-desk-organizations and resolve `orgId` once per '
		+ 'conversation, then pass it as `headers: { orgId }` on every subsequent zoho_api call to '
		+ 'desk.zoho.com.\n\n'
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
		+ '- a few headline metrics or KPIs → render_stat_cards;\n'
		+ '- a single record\'s own field values — confirming what was just created/updated, or '
		+ 'previewing one you looked up — → render_record_card, not a plain-text key:value list. Set '
		+ '`status: "success"` when confirming a completed create/update.\n'
		+ 'If you are about to list three or more numbers, dates, or compared items, render a '
		+ 'visualization instead of a wall of text, then add a short written takeaway (2-4 sentences) '
		+ 'that interprets it. Use at most one or two visualizations per answer, and skip them for '
		+ 'simple factual, yes/no, or how-to answers. Keep all figures grounded in the documentation you cite.\n\n'
		+ 'Never show the same values twice. If you render a visualization, your written reply must not '
		+ 'restate the individual figures it already shows — write a short interpretive takeaway instead '
		+ '(or no written figures at all), not a second copy of the data. This applies just as much to '
		+ 'render_record_card and propose_mutation (its confirmation card already renders every field '
		+ 'you pass it) as to a chart or table — your written reply is one short line (e.g. "Done — the '
		+ 'deal was created." or "I\'ll create this once you confirm."), never a repeat of the field list.\n\n'
		+ 'When you need specific information from the user before you can proceed — required fields you '
		+ 'don\'t have, or an exact value only they can supply — call request_input with the field list '
		+ 'rather than asking in prose; it renders as a fillable form, so give one short sentence of '
		+ 'context and then end your turn, do not also spell out the fields yourself.',
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
 * Resolves the `x-hitl-auto-approve` header value (from the chat's Settings
 * "Auto mode" toggle) to a boolean. Anything other than the literal string
 * `"true"` (including absent) resolves to `false` — HITL confirmation is
 * required by default; it must be explicitly opted out of.
 * @param header - The raw header value, if any.
 * @returns `true` only if `header` is exactly `"true"`.
 */
export function resolveHitlAutoApprove(header: string | undefined): boolean {
	return header === 'true';
}

/**
 * Builds the confirmation-policy paragraph for a turn's instructions, which
 * differs based on whether "Auto mode" is on. Kept out of the static
 * `zohoAssistant.instructions` so it can never contradict the live toggle.
 * Off: describes the two-step protocol that `zoho_api` itself enforces (see
 * `mutation-gate.ts`) — this is not just a request, the tool call fails
 * without a valid `mutationId` from an earlier turn, regardless of what the
 * model decides to do.
 * @param autoApprove - Whether HITL confirmation is bypassed for this turn.
 * @returns The confirmation-policy instructions paragraph.
 */
function confirmationPolicyInstructions(autoApprove: boolean): string {
	return autoApprove
		? 'Auto mode is ON: the user has pre-approved mutating actions for this session. Before making '
			+ 'any mutating call (zoho_api with POST, PUT, PATCH, or DELETE), briefly state in your '
			+ 'written reply what you are about to create/change/delete, then proceed immediately — do '
			+ 'not call propose_mutation (it is unavailable) and do not wait for approval.'
		: 'Before making any mutating call (zoho_api with POST, PUT, PATCH, or DELETE), you MUST first '
			+ 'call propose_mutation with a short action line plus every field being created/changed/deleted '
			+ 'broken out individually (label + value each) — the chat UI renders these as a structured '
			+ 'confirmation card. zoho_api enforces this itself — it will reject the call without a valid '
			+ 'mutationId, so there is no way to skip this step. After calling propose_mutation, reply with '
			+ 'ONE short line saying what this will do — do not restate the field values, the card already '
			+ 'shows them — then end your turn: do NOT call zoho_api in the same turn, it will fail. Only '
			+ 'after the user\'s next message may you retry zoho_api with the returned mutationId — and only '
			+ 'if that message approves the action; if they decline or ask for changes, do not call zoho_api '
			+ 'at all.';
}

/**
 * Before running a turn:
 *  - **enforces conversation ownership.** Conversation ids are client-generated
 *    and Flue's own persistence has no user concept at all — without this,
 *    any authenticated user who obtains another user's conversation id (e.g. a
 *    leaked/shared browser session, or a guessed id) could read that user's
 *    full message history. The first user to send a message to a given id
 *    claims it (`stores.conversationOwners.claimOrGetOwner`); any other user
 *    is rejected with 403 before Flue's own handler ever runs.
 *  - populates the request context for the logged-in user:
 *     - the user's id, so `zoho_api` (built per-turn below) can check the user's
 *       own connection/scopes before acting, and use their own token to call Zoho;
 *     - a fresh `requestId` for this turn — the mutation confirmation gate
 *       (`src/tools/mutation-gate.ts`) uses it to tell "this turn" apart from
 *       "an earlier turn";
 *     - whether HITL confirmation is bypassed (the chat's Settings "Auto mode"
 *       toggle, from the `x-hitl-auto-approve` header — see `resolveHitlAutoApprove`);
 *     - GLM conversations get the user's Zoho token (carries QuickML.deployment.READ)
 *       so the provider calls the endpoint as the user;
 *     - any conversation gets the user's connected MCP servers' tools, injected into
 *       the agent below.
 * Guests get neither the ownership check nor the request context (service
 * token / no MCP tools); the handler falls through to `next()` unchanged in
 * that case — reads are already blocked pre-login by `auth.requireUser` (app.ts).
 * @param c - The Flue agent route context, used to resolve the current user, conversation id, and headers.
 * @param next - The downstream handler to invoke, wrapped with the resolved request context.
 * @returns A `403` JSON response if another user already owns this conversation id;
 * otherwise the result of calling `next()`, either directly (no user) or inside
 * `runWithRequestContext` (logged-in user).
 */
export const route: AgentRouteHandler = async (c, next) => {
	const auth = getAuth();
	const userId = await auth.resolveUserId(c).catch(() => null);
	if (!userId) return next();

	const id = decodeURIComponent(c.req.path.split('/').pop() ?? '');

	const owner = await getStores().conversationOwners.claimOrGetOwner(id, userId);
	if (owner !== userId) return c.json({ error: 'forbidden' }, 403);

	const isGlm = modelForConversation(id).startsWith(`${CATALYST_GLM_API}/`);
	const hitlAutoApprove = resolveHitlAutoApprove(c.req.header('x-hitl-auto-approve'));
	const requestId = crypto.randomUUID();
	const [userToken, mcpTools] = await Promise.all([
		isGlm ? auth.getUserToken(userId).catch(() => undefined) : Promise.resolve(undefined),
		loadUserMcpTools(userId).catch(() => []),
	]);
	// Recorded synchronously, before next() — see request-context.ts for why this
	// (not AsyncLocalStorage) is what defineAgent's initializer reads from below.
	setTurnContext(id, { userId, mcpTools, hitlAutoApprove, requestId });
	return runWithRequestContext({ userToken }, () => next());
};

/**
 * Builds this turn's agent definition: the shared `zohoAssistant` profile (skill,
 * a2ui, and optional KB tools/instructions) plus `check_zoho_connection` and
 * `zoho_api` — both bound to the logged-in user's own connection (their token,
 * their granted scopes; see `ZohoConnectionDeps` in `zoho-connection.ts` —
 * there is no shared-service-account fallback, a missing/outdated connection
 * throws a `ConnectionRequiredPayload` instead of running). `check_zoho_connection`
 * exists purely so the model can discover that cheaply, in one step, instead of
 * only via a `zoho_api` call that was always going to fail the same way —
 * `zoho_api` enforces the same gate regardless, so this isn't a second, weaker
 * check. Also, unless "Auto mode" is on, a `propose_mutation` tool — freshly
 * bound to this turn's mutation-gate context (from the request context set in
 * `route`), plus any MCP tools the logged-in user has connected, augmented with
 * a confirmation-policy paragraph — then resolved to the model chosen for this
 * conversation id.
 * @param id - The conversation/instance id, passed through to `modelForConversation`
 * and used as this turn's mutation-gate conversation id.
 * @returns The agent's `{ profile, model }` for this turn.
 */
export default defineAgent(({ id }) => {
	const turn = currentTurnContext(id);
	const mcp = (turn?.mcpTools ?? []) as NonNullable<typeof zohoAssistant.tools>;
	const autoApprove = turn?.hitlAutoApprove ?? false;
	// Falls back to a fresh id outside a real request (e.g. `flue run` from the
	// CLI, which never calls `route`) — every such invocation is its own
	// isolated "turn", so a propose_mutation id can never be reused within one.
	const requestId = turn?.requestId ?? crypto.randomUUID();
	const gate = { conversationId: id, requestId, autoApprove };
	const auth = getAuth();
	const zohoDeps: ZohoApiDeps = {
		userId: turn?.userId,
		getUserToken: (userId) => auth.getUserToken(userId),
		getGrantedScopes: async (userId) => (await getStores().tokens.get(userId))?.scopes ?? [],
		products: config.zohoProducts,
	};
	const profile = {
		...zohoAssistant,
		tools: [
			defineCheckZohoConnectionTool(zohoDeps),
			defineZohoApiTool(zohoDeps, gate),
			...(autoApprove ? [] : [defineProposeMutationTool(gate.conversationId, gate.requestId)]),
			...(zohoAssistant.tools ?? []),
			...mcp,
		],
		instructions: `${zohoAssistant.instructions}\n\n${confirmationPolicyInstructions(autoApprove)}`,
	};
	return { profile, model: modelForConversation(id) };
});
