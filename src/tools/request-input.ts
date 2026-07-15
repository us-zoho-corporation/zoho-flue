import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

/**
 * Returns a tool the model calls when it needs specific information from the
 * user to proceed and asking in prose would be ambiguous or error-prone (a
 * required field it doesn't have, or a choice among exact values). Unlike
 * `propose_mutation`, nothing here is security- or correctness-sensitive
 * enough to need a deterministic server-side gate — this is a UX nicety (a
 * fillable form instead of a question buried in a reply), so a single static
 * tool with no per-turn state is enough.
 * @returns A Flue tool named `request_input`.
 */
export function defineRequestInputTool() {
	return defineTool({
		name: 'request_input',
		description:
			'Call this when you need specific information from the user to proceed and asking in plain '
			+ 'prose would be ambiguous or error-prone — e.g. required fields you do not have yet, or an '
			+ 'exact value only the user can supply. Renders as a fillable form, so do NOT also list the '
			+ 'needed fields in your own reply; give one short sentence of context, call this with the '
			+ 'field list, then end your turn — the user\'s answers arrive as their next message. Ground '
			+ 'every field in the module\'s real metadata (zoho_skill_get\'s Get Layouts for mandatory '
			+ 'status and layout-scoped picklist values, Get Fields for data types) — never guess whether '
			+ 'a field is actually required or what kind of value it expects, exactly like you would never '
			+ 'guess a picklist value. Set `type` to match the field\'s real data type so the form renders '
			+ 'the right control (a text field asked to hold a date will not validate the way a real date '
			+ 'picker does), and use `type: "select"` with the field\'s real `options` for any picklist the '
			+ 'user must choose themselves rather than free text they could mistype. Pre-fill `defaultValue` '
			+ 'whenever you have a reasonable one (today\'s date, a value already given earlier in the '
			+ 'conversation, a sensible common default) so the user can accept or edit it instead of facing '
			+ 'a blank field with no guidance — leave it empty only when you genuinely have nothing to suggest.',
		input: v.object({
			prompt: v.pipe(
				v.string(),
				v.description('One short sentence of context shown above the fields, e.g. "A few more details to create this Deal:".'),
			),
			fields: v.pipe(
				v.array(v.object({
					label: v.pipe(v.string(), v.description('The field\'s label, e.g. "Deal Name".')),
					type: v.optional(
						v.picklist(['text', 'textarea', 'date', 'number', 'select']),
						'text',
					),
					options: v.optional(
						v.pipe(v.array(v.string()), v.description('Required when type is "select" — the field\'s real, layout-scoped picklist values. Never invented.')),
						[],
					),
					placeholder: v.optional(v.string(), ''),
					defaultValue: v.optional(v.pipe(v.string(), v.description('A sensible pre-filled value, if you have one — the user can still edit or clear it.')), ''),
					required: v.optional(v.boolean(), true),
				})),
				v.description('Every field the user needs to fill in.'),
			),
		}),
		output: v.object({ note: v.string() }),
		/**
		 * Acknowledges the form request. Nothing to register server-side —
		 * unlike `propose_mutation`, no later tool call depends on this having
		 * happened, so there's no id to mint or gate to arm.
		 * @returns A note instructing the model to stop and wait for the user's answers.
		 */
		run() {
			return {
				note:
					'Rendered as a form. End your turn now — do not guess the values yourself; the user\'s '
					+ 'filled-in answers will arrive as their next message.',
			};
		},
	});
}
