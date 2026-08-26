import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

/**
 * a2ui — application-to-UI generative rendering tools.
 *
 * These tools carry no side effects and fetch nothing. Their entire purpose is
 * to let the model emit a *visualization spec* as the tool INPUT; the frontend
 * reads that input (which streams incrementally through Flue's durable event
 * stream as a `dynamic-tool` part) and renders it with Kumo UI + Apache ECharts.
 *
 * Because the spec lives in the input, the visualization builds live as the
 * model streams tokens. Each tool returns a small acknowledgement so the model
 * knows the surface was shown and can continue with its written answer.
 */

const ack = v.object({
	ok: v.boolean(),
	note: v.pipe(v.string(), v.description('Confirmation that the visualization was rendered to the user.')),
});

/**
 * Builds the acknowledgement result returned by an a2ui tool after its spec has
 * been handed off to the frontend for rendering.
 * @param what - Human-readable description of the surface that was rendered (e.g. "a chart"),
 * interpolated into the acknowledgement note.
 * @returns An `{ ok: true, note }` acknowledgement instructing the model to follow up with a
 * short written takeaway instead of stopping on the tool call.
 */
const rendered = (what: string) => ({
	ok: true,
	note:
		`Rendered ${what} to the user. It is now visible above your reply. `
		+ 'Do not stop here: write a short plain-text takeaway (2-4 sentences) that '
		+ 'interprets it and answers the question. Do not repeat the raw numbers.',
});

// ─── Chart ──────────────────────────────────────────────────────────────────────

const chartSeries = v.object({
	name: v.pipe(v.string(), v.description('Series label shown in the legend and tooltip.')),
	data: v.pipe(
		v.array(v.number()),
		v.description('One numeric value per category, in the same order as `categories`.'),
	),
});

export const renderChart = defineTool({
	name: 'render_chart',
	description:
		'Display a chart to the user. Use for comparisons and trends: `bar` to compare values '
		+ 'across categories, `line`/`area` for trends over an ordered axis, and `pie` for parts '
		+ 'of a whole (provide exactly one series for `pie`). Prefer a chart over a long list of '
		+ 'numbers. Always also give a short written takeaway.',
	input: v.object({
		chartType: v.pipe(
			v.picklist(['bar', 'line', 'area', 'pie']),
			v.description('The visual form of the chart.'),
		),
		title: v.optional(v.pipe(v.string(), v.description('Short chart title.'))),
		description: v.optional(v.pipe(v.string(), v.description('One-line caption shown under the chart.'))),
		categories: v.pipe(
			v.array(v.string()),
			v.description('X-axis labels (bar/line/area) or slice labels (pie).'),
		),
		series: v.pipe(
			v.array(chartSeries),
			v.description('One or more data series. For `pie`, provide exactly one series.'),
		),
		stacked: v.optional(v.pipe(v.boolean(), v.description('Stack bar/area series on top of each other.'))),
		xAxisLabel: v.optional(v.string()),
		yAxisLabel: v.optional(v.string()),
	}),
	output: ack,
	/**
	 * Acknowledges that the model's chart spec (carried in the tool input) was rendered.
	 * @returns An acknowledgement instructing the model to add a written takeaway.
	 */
	run: async () => ({ output: rendered('a chart') }),
});

// ─── Comparison table ─────────────────────────────────────────────────────────

export const renderComparisonTable = defineTool({
	name: 'render_comparison_table',
	description:
		'Display a structured comparison table. Use when comparing several items across the '
		+ 'same set of attributes (e.g. plans, products, options). Each row is a list of cell '
		+ 'strings aligned to `columns`.',
	input: v.object({
		title: v.optional(v.pipe(v.string(), v.description('Short table title.'))),
		columns: v.pipe(
			v.array(v.string()),
			v.description('Header labels. The first column is typically the item/attribute name.'),
		),
		rows: v.pipe(
			v.array(v.array(v.string())),
			v.description('Each row is an array of cell strings, one per column, in column order.'),
		),
		highlightColumn: v.optional(v.pipe(
			v.number(),
			v.description('Zero-based index of a column to visually emphasize (e.g. a recommended option).'),
		)),
		caption: v.optional(v.pipe(v.string(), v.description('One-line note shown under the table.'))),
	}),
	output: ack,
	/**
	 * Acknowledges that the model's comparison-table spec (carried in the tool input) was rendered.
	 * @returns An acknowledgement instructing the model to add a written takeaway.
	 */
	run: async () => ({ output: rendered('a comparison table') }),
});

// ─── Stat cards ─────────────────────────────────────────────────────────────────

const statCard = v.object({
	label: v.pipe(v.string(), v.description('What the metric measures.')),
	value: v.pipe(v.string(), v.description('The headline value, pre-formatted (e.g. "1,204", "98%", "$4.2M").')),
	delta: v.optional(v.pipe(v.string(), v.description('Change indicator, e.g. "+12%" or "-3 pts".'))),
	trend: v.optional(v.pipe(
		v.picklist(['up', 'down', 'flat']),
		v.description('Direction of the delta, controls the arrow and color.'),
	)),
	help: v.optional(v.pipe(v.string(), v.description('Short clarifying note shown under the value.'))),
});

export const renderStatCards = defineTool({
	name: 'render_stat_cards',
	description:
		'Display a row of key-metric cards (KPIs). Use to summarize a few headline numbers, '
		+ 'each with an optional change/trend indicator.',
	input: v.object({
		title: v.optional(v.pipe(v.string(), v.description('Short heading for the group of cards.'))),
		cards: v.pipe(v.array(statCard), v.description('The metric cards, shown left to right.')),
	}),
	output: ack,
	/**
	 * Acknowledges that the model's stat-card spec (carried in the tool input) was rendered.
	 * @returns An acknowledgement instructing the model to add a written takeaway.
	 */
	run: async () => ({ output: rendered('metric cards') }),
});

// ─── Record card ────────────────────────────────────────────────────────────────

const recordField = v.object({
	label: v.pipe(v.string(), v.description('The field name, e.g. "Amount" or "Closing Date".')),
	value: v.pipe(v.string(), v.description('The field\'s value, exactly as it should be shown (e.g. "25000", "2026-08-31").')),
});

export const renderRecordCard = defineTool({
	name: 'render_record_card',
	description:
		'Display a single record\'s fields as a clean, structured card — for confirming what was '
		+ 'just created/updated, or previewing one record\'s details (a proposed mutation\'s own '
		+ 'confirmation card already does this for you — this tool is for everywhere else, e.g. '
		+ 'after a create/update call succeeds, or showing a record you looked up). Use this '
		+ 'instead of listing field: value pairs in your written reply — your reply should be one '
		+ 'short line (e.g. "Done — the deal was created."); the card shows the rest.',
	input: v.object({
		title: v.pipe(v.string(), v.description('The record\'s primary identifier, e.g. a Deal name or Contact\'s full name.')),
		subtitle: v.optional(v.pipe(v.string(), v.description('Short context line, e.g. "Zoho CRM · Deal" or the module/record type.'))),
		status: v.optional(v.pipe(
			v.picklist(['success', 'neutral']),
			v.description('"success" shows a checkmark (just created/updated); omit or "neutral" for a plain preview/lookup.'),
		)),
		fields: v.pipe(v.array(recordField), v.description('The record\'s field values, in display order.')),
	}),
	output: ack,
	/**
	 * Acknowledges that the model's record-card spec (carried in the tool input) was rendered.
	 * @returns An acknowledgement instructing the model to add a short written takeaway.
	 */
	run: async () => ({ output: rendered('a record card') }),
});

/** All a2ui presentation tools, ready to spread into an agent's `tools`. */
export const a2uiTools = [renderChart, renderComparisonTable, renderStatCards, renderRecordCard];
