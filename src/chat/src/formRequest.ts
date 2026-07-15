// Normalizes a `request_input` tool call's completed output into a typed spec
// for the form card. Only consulted once the step is `output-available` (see
// `Thread.tsx`'s `pendingFormRequest`), so — unlike the a2ui specs, which
// stream in incrementally — there's no partial/pending state to model here.

export type FormFieldType = 'text' | 'textarea' | 'date' | 'number' | 'select';
const FORM_FIELD_TYPES: readonly FormFieldType[] = ['text', 'textarea', 'date', 'number', 'select'];

export interface FormRequestField {
	label: string;
	type: FormFieldType;
	/** Only meaningful when `type === 'select'`. */
	options: string[];
	placeholder: string;
	defaultValue: string;
	required: boolean;
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
		.map((f) => {
			const type = (typeof f['type'] === 'string' && (FORM_FIELD_TYPES as string[]).includes(f['type'])) ? f['type'] as FormFieldType : 'text';
			const options = Array.isArray(f['options']) ? f['options'].filter((o): o is string => typeof o === 'string') : [];
			return {
				label: f['label'] as string,
				type,
				options: type === 'select' ? options : [],
				placeholder: typeof f['placeholder'] === 'string' ? f['placeholder'] : '',
				defaultValue: typeof f['defaultValue'] === 'string' ? f['defaultValue'] : '',
				required: typeof f['required'] === 'boolean' ? f['required'] : true,
			};
		});

	if (fields.length === 0) return null;
	return { prompt: obj['prompt'], fields };
}

/**
 * Reconstructs the filled-in `label: value` pairs from a submitted form's
 * composed reply text (see `Thread.tsx`'s `FormRequestCard.submit`), matching
 * each line against the original spec's field labels. This is how the chat
 * renders a submitted form as a card instead of the plain-text reply that
 * was actually sent — the model still gets the same plain text; only the
 * history display is reconstructed from it. Returns `null` (falling back to
 * a plain message bubble) if any line doesn't cleanly match a real field —
 * e.g. the user typed a free-text reply instead of using the form.
 * @param spec - The form spec the reply is expected to answer.
 * @param text - The user message's raw text.
 * @returns The matched `{label, value}` pairs in the order they appear, or `null` if unmatched.
 */
export function matchFormSubmission(spec: FormRequestSpec, text: string): { label: string; value: string }[] | null {
	const validLabels = new Set(spec.fields.map((f) => f.label));
	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0) return null;

	const matched: { label: string; value: string }[] = [];
	for (const line of lines) {
		const sep = line.indexOf(': ');
		if (sep === -1) return null;
		const label = line.slice(0, sep);
		const value = line.slice(sep + 2);
		if (!validLabels.has(label)) return null;
		matched.push({ label, value });
	}
	return matched;
}
