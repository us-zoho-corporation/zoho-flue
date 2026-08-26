'use agent';

import { type AgentProps, useModel, useTool } from '@flue/runtime';
import type { ToolDefinition } from '@flue/runtime';
import type { MiddlewareHandler } from 'hono';
import { config } from '../config';
import { defineZohoApiTool, type MutationGateContext, type ZohoApiDeps } from '../tools/zoho-api';
import { defineCheckZohoConnectionTool } from '../tools/check-zoho-connection';
import { defineProposeMutationTool, defineProposeMutationBatchTool } from '../tools/propose-mutation';
import { defineRequestInputTool } from '../tools/request-input';
import { zohoSkillTools } from '../tools/zoho-skills';
import { a2uiTools } from '../tools/a2ui';
import { defineZohoKbTools } from '../mcp/zoho-kb';
import { getAuth } from '../auth';
import { currentTurnContext, setTurnContext } from '../auth/request-context';
import { loadUserMcpTools } from '../mcp/live';
import { getStores } from '../store';

/** Where `app.ts` mounts the assistant's HTTP surface — shared with `assistantMiddleware`, which parses the conversation id out of this same prefix. */
export const ASSISTANT_MOUNT_PATH = '/agents/assistant';

// The assistant's static behavior — tools + instructions always present
// regardless of connection/auto-mode state. `zoho_api` (and `propose_mutation`,
// when confirmation is required) are deliberately NOT included here: both are
// mounted fresh per render in `Assistant` below, bound to that turn's
// mutation-gate context, so the confirmation requirement can't go stale or be
// bypassed by stale closures.
const BASE_TOOLS: ToolDefinition[] = [...zohoSkillTools, ...a2uiTools, defineRequestInputTool()];

const BASE_INSTRUCTIONS =
	'You are a Zoho product assistant. For questions about Zoho products (features, '
	+ 'configuration, APIs, troubleshooting), use zoho_kb_search to find the relevant '
	+ 'documentation, then answer directly and concisely from what you found. Refine and '
	+ 'search again only if the first results fall short, and use zoho_kb_get_page when you '
	+ 'need an article’s full text. Ground your answer in the documentation and cite source URLs. '
	+ 'If the knowledge base isn\'t connected yet, calling zoho_kb_search throws and a Connect/'
	+ 'Reconnect button appears in the chat automatically — say so in one short line and stop, '
	+ 'do not explain how to connect yourself.\n\n'
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
	+ 'never guess a picklist field\'s value (Stage, Pipeline, Lead_Source, Industry, etc.), and '
	+ 'never guess whether a field is actually required — all three are customized per org/layout '
	+ 'with no universal default, and general Zoho product knowledge (e.g. "Deals usually have an '
	+ 'Account") is not the same as this org\'s actual configuration. The zoho-crm-modules-and-fields '
	+ 'skill\'s Get Layouts has the real, layout-scoped mandatory status and picklist values for '
	+ 'every field (Get Fields alone is NOT layout-scoped and does not reflect either one); for '
	+ 'Deals\' Pipeline/Stage specifically, Get Pipelines too. Check it before creating or updating a '
	+ 'record, and before deciding what to ask the user for via request_input — both the `required` '
	+ 'flag and the `type` you set there (date/number/select/etc.) should come from this real field '
	+ 'metadata, not a guess, especially when you\'re inventing the data yourself (e.g. a sample/dummy '
	+ 'record) rather than reflecting a value the user gave you. '
	+ 'Available skills:\n'
	+ '- zoho-crm-records, zoho-crm-modules-and-fields, zoho-crm-query, zoho-crm-bulk-operations, '
	+ 'zoho-crm-record-actions, zoho-crm-related-records, zoho-crm-attachments, zoho-crm-emails, '
	+ 'zoho-crm-users-and-org, zoho-crm-workflow-automation, zoho-crm-blueprints (CRM v8 REST API)\n'
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
	+ 'render_record_card and propose_mutation/propose_mutation_batch (their confirmation cards '
	+ 'already render every field/action you pass them) as to a chart or table — your written reply '
	+ 'is one short line (e.g. "Done — the deal was created." or "I\'ll do this once you confirm."), '
	+ 'never a repeat of the field or action list.\n\n'
	+ 'When you need specific information from the user before you can proceed — required fields you '
	+ 'don\'t have, or an exact value only they can supply — call request_input with the field list '
	+ 'rather than asking in prose; it renders as a fillable form, so give one short sentence of '
	+ 'context and then end your turn, do not also spell out the fields yourself. Ground every field '
	+ 'in whatever real information you already have access to, rather than guessing: don\'t mark a '
	+ 'field required unless something you actually checked says so, set `type` to match the kind of '
	+ 'value it needs (date/number/select/etc.) instead of leaving everything as plain text, and '
	+ 'pre-fill `defaultValue` with a real suggestion (today\'s date, a value already given earlier '
	+ 'in the conversation, a sensible common default) whenever you have one, rather than leaving the '
	+ 'user to guess with nothing but a label.';

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
 * differs based on whether "Auto mode" is on. Kept out of `BASE_INSTRUCTIONS`
 * so it can never contradict the live toggle. Off: describes the two-step
 * protocol that `zoho_api` itself enforces (see `mutation-gate.ts`) — this is
 * not just a request, the tool call fails without a valid `mutationId` from
 * an earlier turn, regardless of what the model decides to do.
 * @param autoApprove - Whether HITL confirmation is bypassed for this turn.
 * @returns The confirmation-policy instructions paragraph.
 */
function confirmationPolicyInstructions(autoApprove: boolean): string {
	return autoApprove
		? 'Auto mode is ON: the user has pre-approved mutating actions for this session. Before making '
			+ 'any mutating call (zoho_api with POST, PUT, PATCH, or DELETE), briefly state in your '
			+ 'written reply what you are about to create/change/delete, then proceed immediately — do '
			+ 'not call propose_mutation or propose_mutation_batch (both are unavailable) and do not wait '
			+ 'for approval.'
		: 'Before making any mutating call (zoho_api with POST, PUT, PATCH, or DELETE), you MUST first '
			+ 'call propose_mutation with a short action line plus every field being created/changed/deleted '
			+ 'broken out individually (label + value each) — the chat UI renders these as a structured '
			+ 'confirmation card. If you are about to perform SEVERAL such actions together as one coherent '
			+ 'operation (e.g. creating a handful of related records, or a batch of dependent creates/'
			+ 'updates), call propose_mutation_batch ONCE instead, with every action listed in the exact '
			+ 'order you will perform them — the chat UI renders the whole sequence as one ordered '
			+ 'confirmation card and the user approves it with a single click, rather than being asked once '
			+ 'per action. Use propose_mutation_batch only when the actions are genuinely part of one '
			+ 'operation the user asked for as a group; keep using plain propose_mutation for a single, '
			+ 'standalone action. Either way, zoho_api enforces this itself — it will reject the call '
			+ 'without a valid mutationId, so there is no way to skip this step. After calling either tool, '
			+ 'reply with ONE short line saying what this will do — do not restate the action(s) or field '
			+ 'values, the card already shows them — then end your turn: do NOT call zoho_api in the same '
			+ 'turn, it will fail. Only after the user\'s next message may you retry zoho_api with the '
			+ 'returned mutationId(s) — for a batch, retry once per action, in the same order, each with its '
			+ 'matching mutationId — and only if that message approves the action(s); if they decline or ask '
			+ 'for changes, do not call zoho_api at all.';
}

/**
 * Hono middleware mounted ahead of `createAgentRouter(Assistant)` at
 * `ASSISTANT_MOUNT_PATH` in `app.ts`. Before running a turn:
 *  - **enforces conversation ownership.** Conversation ids are client-generated
 *    and Flue's own persistence has no user concept at all — without this,
 *    any authenticated user who obtains another user's conversation id (e.g. a
 *    leaked/shared browser session, or a guessed id) could read that user's
 *    full message history. The first user to send a message to a given id
 *    claims it (`stores.conversationOwners.claimOrGetOwner`); any other user
 *    is rejected with 403 before the agent router ever runs.
 *  - populates the request context for the logged-in user:
 *     - the user's id, so `zoho_api` (built per-render in `Assistant`) can check
 *       the user's own connection/scopes before acting, and use their own token
 *       to call Zoho;
 *     - a fresh `requestId` for this turn — the mutation confirmation gate
 *       (`src/tools/mutation-gate.ts`) uses it to tell "this turn" apart from
 *       "an earlier turn";
 *     - whether HITL confirmation is bypassed (the chat's Settings "Auto mode"
 *       toggle, from the `x-hitl-auto-approve` header — see `resolveHitlAutoApprove`);
 *     - any conversation gets the user's connected MCP servers' tools, injected into
 *       `Assistant` below.
 * Guests get neither the ownership check nor the request context; the handler
 * falls through to `next()` unchanged in that case — reads are already
 * blocked pre-login by `auth.requireUser` (app.ts).
 * @param c - The Hono request context.
 * @param next - The downstream handler (the mounted agent router).
 * @returns A `403` JSON response if another user already owns this conversation id;
 * otherwise the result of calling `next()`.
 */
export const assistantMiddleware: MiddlewareHandler = async (c, next) => {
	const auth = getAuth();
	const userId = await auth.resolveUserId(c).catch(() => null);
	if (!userId) return next();

	const prefix = `${ASSISTANT_MOUNT_PATH}/`;
	const rest = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : '';
	const id = decodeURIComponent(rest.split('/')[0] ?? '');

	const owner = await getStores().conversationOwners.claimOrGetOwner(id, userId);
	if (owner !== userId) return c.json({ error: 'forbidden' }, 403);

	const hitlAutoApprove = resolveHitlAutoApprove(c.req.header('x-hitl-auto-approve'));
	const requestId = crypto.randomUUID();
	const mcpTools = await loadUserMcpTools(userId).catch(() => []);
	// Recorded synchronously, before next() — see request-context.ts for why this
	// (not AsyncLocalStorage) is what `Assistant`'s render reads from below.
	setTurnContext(id, { userId, mcpTools, hitlAutoApprove, requestId });
	return next();
};

/**
 * The Zoho product assistant agent. Re-renders before every model turn: reads
 * this turn's context (user id, Auto mode, MCP tools) recorded synchronously by
 * `assistantMiddleware`, mounts `check_zoho_connection`/`zoho_api` — both bound
 * to the logged-in user's own connection (their token, their granted scopes;
 * see `ZohoConnectionDeps` in `zoho-connection.ts` — there is no shared-service-
 * account fallback, a missing/outdated connection throws a
 * `ConnectionRequiredPayload` instead of running) — plus, unless "Auto mode" is
 * on, `propose_mutation`/`propose_mutation_batch` (both freshly bound to this
 * turn's mutation-gate context), the static base tools (skills, a2ui,
 * request_input), the docs KB tools when configured, and any MCP tools the
 * logged-in user has connected. Returns the base instructions plus the
 * confirmation-policy paragraph matching this turn's Auto mode state.
 * @param props - `{ id }`, the conversation/instance id — passed to
 * `modelForConversation` and used as this turn's mutation-gate conversation id.
 * @returns The assistant's instruction document for this render.
 */
export function Assistant({ id }: AgentProps): string {
	const turn = currentTurnContext(id);
	const mcp = (turn?.mcpTools ?? []) as ToolDefinition[];
	const autoApprove = turn?.hitlAutoApprove ?? false;
	// Falls back to a fresh id outside a real request (e.g. `flue run` from the
	// CLI, which never runs `assistantMiddleware`) — every such invocation is its
	// own isolated "turn", so a propose_mutation id can never be reused within one.
	const requestId = turn?.requestId ?? crypto.randomUUID();
	const gate: MutationGateContext = { conversationId: id, requestId, autoApprove };
	const auth = getAuth();
	const zohoDeps: ZohoApiDeps = {
		userId: turn?.userId,
		getUserToken: (userId) => auth.getUserToken(userId),
		getGrantedScopes: async (userId) => (await getStores().tokens.get(userId))?.scopes ?? [],
		products: config.zohoProducts,
	};

	useModel(modelForConversation(id));

	useTool(defineCheckZohoConnectionTool(zohoDeps));
	useTool(defineZohoApiTool(zohoDeps, gate));
	if (!autoApprove) {
		useTool(defineProposeMutationTool(gate.conversationId, gate.requestId));
		useTool(defineProposeMutationBatchTool(gate.conversationId, gate.requestId));
	}
	for (const tool of BASE_TOOLS) useTool(tool);
	if (config.docsOauthClientId) {
		for (const tool of defineZohoKbTools({ userId: turn?.userId, getDocsToken: (userId) => auth.getDocsToken(userId) })) {
			useTool(tool);
		}
	}
	for (const tool of mcp) useTool(tool);

	return `${BASE_INSTRUCTIONS}\n\n${confirmationPolicyInstructions(autoApprove)}`;
}
// Pins the durable conversation-storage identity to the beta's filename-derived
// name (independent of the exported function's own capitalization).
Assistant.agentName = 'assistant';
