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
	run: async () => rendered('a chart'),
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
	run: async () => rendered('a comparison table'),
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
	run: async () => rendered('metric cards'),
});

/** All a2ui presentation tools, ready to spread into an agent's `tools`. */
export const a2uiTools = [renderChart, renderComparisonTable, renderStatCards];
