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
			+ 'field list, then end your turn — the user\'s answers arrive as their next message.',
		input: v.object({
			prompt: v.pipe(
				v.string(),
				v.description('One short sentence of context shown above the fields, e.g. "A few more details to create this Deal:".'),
			),
			fields: v.pipe(
				v.array(v.object({
					label: v.pipe(v.string(), v.description('The field\'s label, e.g. "Deal Name".')),
					placeholder: v.optional(v.string(), ''),
					required: v.optional(v.boolean(), true),
					multiline: v.optional(v.boolean(), false),
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
