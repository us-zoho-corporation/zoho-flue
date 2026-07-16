import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { proposeMutation } from './mutation-gate';

/**
 * Returns a tool the model must call before any mutating `zoho_api` call
 * (unless "Auto mode" is on): it registers the proposed action and returns a
 * `mutationId` that only becomes usable in a later turn — see `mutation-gate.ts`
 * for why this, not the model's own judgment, is what makes confirmation
 * deterministic.
 * @param conversationId - The conversation this turn belongs to.
 * @param requestId - This turn's request id (from the request context).
 * @returns A Flue tool named `propose_mutation`.
 */
export function defineProposeMutationTool(conversationId: string, requestId: string) {
	return defineTool({
		name: 'propose_mutation',
		description:
			'REQUIRED before any zoho_api call with POST, PUT, PATCH, or DELETE (unless Auto mode is '
			+ 'on). Call this with a short action line plus the individual record fields broken out — '
			+ 'the chat UI renders these as a structured confirmation card, so do NOT also restate the '
			+ 'field values in your own reply; just say in one short line what you are about to do (the '
			+ 'card shows the rest), then STOP — end your turn without calling zoho_api. The returned '
			+ 'mutationId is only usable in a LATER turn, after the user\'s next message; zoho_api will '
			+ 'reject it if you try to use it in this same turn.',
		input: v.object({
			action: v.pipe(v.string(), v.description('A short, plain-language description of the action, e.g. "Create a Deal in Zoho CRM".')),
			fields: v.pipe(
				v.array(v.object({
					label: v.pipe(v.string(), v.description('A short field name, e.g. "Deal Name".')),
					value: v.pipe(v.string(), v.description('The field\'s value, exactly as it will be sent to Zoho.')),
				})),
				v.description('Every field being created/changed/deleted, broken out individually — not folded into `action`.'),
			),
		}),
		output: v.object({
			mutationId: v.string(),
			note: v.string(),
		}),
		/**
		 * Registers the proposed mutation and returns its id.
		 * @param input - The action description and field list to register.
		 * @returns The minted `mutationId` and a note instructing the model to stop and wait.
		 */
		async run({ input }) {
			const description = [input.action, ...input.fields.map((f) => `${f.label}: ${f.value}`)].join('\n');
			const mutationId = proposeMutation(conversationId, description, requestId);
			return {
				mutationId,
				note:
					'Registered. Reply with one short line saying what this will do — the confirmation card '
					+ 'already shows the field values, so do not repeat them — then end your turn now, do not '
					+ 'call zoho_api yet, it will be rejected. Once the user responds (in their next message), '
					+ 'retry zoho_api with this exact mutationId if they approved.',
			};
		},
	});
}

/**
 * Returns a tool the model must call before performing SEVERAL related
 * mutating `zoho_api` calls together as one coherent operation (unless "Auto
 * mode" is on) — e.g. creating a handful of related records, or a sequence of
 * dependent creates/updates — instead of calling `propose_mutation` once per
 * action. It registers every action in the batch (each via the same
 * {@link proposeMutation}, so each gets its own independent, one-time-use id —
 * no change to the underlying gate was needed) and returns one `mutationId`
 * per action, in the same order, each only usable in a later turn exactly
 * like a single `propose_mutation` id.
 * @param conversationId - The conversation this turn belongs to.
 * @param requestId - This turn's request id (from the request context).
 * @returns A Flue tool named `propose_mutation_batch`.
 */
export function defineProposeMutationBatchTool(conversationId: string, requestId: string) {
	return defineTool({
		name: 'propose_mutation_batch',
		description:
			'REQUIRED before a SEQUENCE of related mutating zoho_api calls performed together as one '
			+ 'coherent operation (unless Auto mode is on) — use this instead of calling propose_mutation '
			+ 'once per action when you are about to perform several mutating actions in a row (e.g. '
			+ 'creating a handful of related records, or a batch of dependent creates/updates). For a '
			+ 'single, standalone action use propose_mutation instead. Call this once with every action '
			+ 'broken out individually, each with its own field list, in the exact order you will perform '
			+ 'them — the chat UI renders the whole sequence as one ordered confirmation card, so do NOT '
			+ 'restate the actions or field values in your own reply; say in one short line what the batch '
			+ 'will do, then STOP — end your turn without calling zoho_api. The returned mutationIds are '
			+ 'only usable in a LATER turn, in the same order as `actions`; zoho_api will reject any of '
			+ 'them if used in this same turn.',
		input: v.object({
			actions: v.pipe(
				v.array(v.object({
					action: v.pipe(v.string(), v.description('A short, plain-language description of this one action, e.g. "Create a Lead".')),
					fields: v.pipe(
						v.array(v.object({
							label: v.pipe(v.string(), v.description('A short field name, e.g. "Last Name".')),
							value: v.pipe(v.string(), v.description('The field\'s value, exactly as it will be sent to Zoho.')),
						})),
						v.description('Every field being created/changed/deleted for this one action, broken out individually.'),
					),
				})),
				v.minLength(1),
				v.description('Every action in the batch, in the exact order you will perform them.'),
			),
		}),
		output: v.object({
			mutationIds: v.array(v.string()),
			note: v.string(),
		}),
		/**
		 * Registers every action in the batch and returns their ids, in order.
		 * @param input - The ordered list of actions (each with its own field list) to register.
		 * @returns The minted `mutationIds` (same order as `input.actions`) and a note instructing the model to stop and wait.
		 */
		async run({ input }) {
			const mutationIds = input.actions.map((a) => {
				const description = [a.action, ...a.fields.map((f) => `${f.label}: ${f.value}`)].join('\n');
				return proposeMutation(conversationId, description, requestId);
			});
			return {
				mutationIds,
				note:
					'Registered. Reply with one short line saying what this batch will do — the confirmation '
					+ 'card already shows every action and its fields, so do not repeat them — then end your '
					+ 'turn now, do not call zoho_api yet, it will be rejected. Once the user responds (in '
					+ 'their next message), if they approved, retry zoho_api once per action IN THE SAME '
					+ 'ORDER, each with its matching mutationId from this same batch (mutationIds[0] for '
					+ 'actions[0], mutationIds[1] for actions[1], and so on).',
			};
		},
	});
}
