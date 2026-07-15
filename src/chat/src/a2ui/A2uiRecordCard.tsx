import { CheckCircle, Sparkle } from '@phosphor-icons/react';
import type { RecordCardSpec, RecordField } from './spec.ts';

// A value over this length (or containing a line break) reads poorly crammed
// into a label/value row next to short fields like "Amount" — it gets its own
// full-width block below instead, so short and long fields each get the
// layout that actually fits their content.
const LONG_VALUE_THRESHOLD = 60;

/**
 * Whether a field's value is long-form text that shouldn't share a compact
 * label/value row with short fields.
 * @param value - The field value to check.
 * @returns `true` if `value` is long or multi-line.
 */
function isLongValue(value: string): boolean {
	return value.length > LONG_VALUE_THRESHOLD || value.includes('\n');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a field's value looks like a bare ISO date (`YYYY-MM-DD`), the
 * shape Zoho's API returns for date-only fields.
 * @param value - The field value to check.
 * @returns `true` if `value` matches the ISO date pattern.
 */
function looksLikeDate(value: string): boolean {
	return ISO_DATE.test(value.trim());
}

/**
 * Formats an ISO date string into a friendlier display form (e.g. "Aug 31,
 * 2026"), falling back to the original string if it doesn't parse.
 * @param value - The ISO date string to format.
 * @returns The formatted date, or `value` unchanged if it isn't a valid date.
 */
function formatDate(value: string): string {
	const d = new Date(`${value.trim()}T00:00:00`);
	if (Number.isNaN(d.getTime())) return value;
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const PLAIN_NUMBER = /^-?[\d,]+(\.\d+)?$/;

/**
 * Whether a field's value is a bare number (optionally comma-grouped/decimal),
 * so it can be right-aligned in tabular figures like a real amount column.
 * @param value - The field value to check.
 * @returns `true` if `value` is a plain number.
 */
function looksNumeric(value: string): boolean {
	return PLAIN_NUMBER.test(value.trim());
}

/**
 * Renders one compact label/value row, applying light formatting heuristics
 * (friendlier dates, tabular-aligned numbers) without needing the model to
 * pre-format every value itself.
 * @param props - Component props.
 * @param props.field - The field to render.
 * @returns The rendered row.
 */
function RecordRow({ field }: { field: RecordField }) {
	const isDate = looksLikeDate(field.value);
	const isNumeric = looksNumeric(field.value);
	const display = isDate ? formatDate(field.value) : field.value;
	return (
		<div className="a2ui-record-row">
			<span className="a2ui-record-row-label">{field.label}</span>
			<span className={`a2ui-record-row-value${isNumeric ? ' a2ui-record-row-value-numeric' : ''}`}>{display}</span>
		</div>
	);
}

/**
 * Renders a single record's fields as a structured card: a status icon plus
 * title/subtitle header, a compact two-column row for short field values, and
 * full-width blocks for long-form ones (e.g. a Description) below that — used
 * both for the mutation-confirmation preview (synthesized client-side from
 * `propose_mutation`'s own input, see `Thread.tsx`) and for the model's own
 * `render_record_card` calls (e.g. confirming a completed create/update).
 * @param props - Component props.
 * @param props.spec - The normalized, ready-to-render record card spec.
 * @returns The rendered record card element.
 */
export function A2uiRecordCard({ spec }: { spec: RecordCardSpec }) {
	const shortFields = spec.fields.filter((f) => !isLongValue(f.value));
	const longFields = spec.fields.filter((f) => isLongValue(f.value));

	return (
		<div className="a2ui-record-card">
			<div className="a2ui-record-head">
				<span className={`a2ui-record-status${spec.status === 'success' ? ' a2ui-record-status-success' : ''}`}>
					{spec.status === 'success' ? <CheckCircle size={15} weight="fill" /> : <Sparkle size={13} weight="fill" />}
				</span>
				<div className="a2ui-record-head-text">
					<p className="a2ui-record-title">{spec.title}</p>
					{spec.subtitle && <p className="a2ui-record-subtitle">{spec.subtitle}</p>}
				</div>
			</div>

			{shortFields.length > 0 && (
				<div className="a2ui-record-rows">
					{shortFields.map((f, i) => <RecordRow field={f} key={i} />)}
				</div>
			)}

			{longFields.length > 0 && (
				<div className="a2ui-record-long">
					{longFields.map((f, i) => (
						<div className="a2ui-record-long-field" key={i}>
							<span className="a2ui-record-row-label">{f.label}</span>
							<p className="a2ui-record-long-value">{f.value}</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
