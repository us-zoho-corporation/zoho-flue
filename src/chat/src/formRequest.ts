// Normalizes a `request_input` tool call's completed output into a typed spec
// for the form card. Only consulted once the step is `output-available` (see
// `Thread.tsx`'s `pendingFormRequest`), so — unlike the a2ui specs, which
// stream in incrementally — there's no partial/pending state to model here.

export interface FormRequestField {
	label: string;
	placeholder: string;
	required: boolean;
	multiline: boolean;
}

export interface FormRequestSpec {
	prompt: string;
	fields: FormRequestField[];
}

/**
 * Normalizes a `request_input` tool call's raw input into a `FormRequestSpec`,
 * dropping any field missing a label. Returns `null` if there's no usable
 * prompt or no fields survive that filter.
 * @param input - The raw, untrusted tool-call input.
 * @returns The normalized spec, or `null` if it isn't renderable.
 */
export function parseFormRequest(input: unknown): FormRequestSpec | null {
	if (!input || typeof input !== 'object') return null;
	const obj = input as Record<string, unknown>;
	if (typeof obj['prompt'] !== 'string' || !obj['prompt']) return null;
	if (!Array.isArray(obj['fields'])) return null;

	const fields: FormRequestField[] = obj['fields']
		.filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof f['label'] === 'string' && !!f['label'])
		.map((f) => ({
			label: f['label'] as string,
			placeholder: typeof f['placeholder'] === 'string' ? f['placeholder'] : '',
			required: typeof f['required'] === 'boolean' ? f['required'] : true,
			multiline: typeof f['multiline'] === 'boolean' ? f['multiline'] : false,
		}));

	if (fields.length === 0) return null;
	return { prompt: obj['prompt'], fields };
}
