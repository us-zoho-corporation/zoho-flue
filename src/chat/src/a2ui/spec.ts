// a2ui spec parsing.
//
// The visualization spec is authored by the model as a tool-call INPUT and
// streams in incrementally, so at any given render the input may be a partial
// (or even malformed) object. These normalizers are deliberately tolerant:
// they return `{ status: 'pending' }` until enough of the spec has arrived to
// draw something meaningful, and only then `{ status: 'ready', spec }`. The
// title (when present) is surfaced even while pending so a skeleton can label
// itself as it fills in.

export const A2UI_TOOL_NAMES = ['render_chart', 'render_comparison_table', 'render_stat_cards'] as const;
export type A2uiToolName = (typeof A2UI_TOOL_NAMES)[number];

export function isA2uiTool(name: string): name is A2uiToolName {
	return (A2UI_TOOL_NAMES as readonly string[]).includes(name);
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie';

export interface ChartSeries {
	name: string;
	data: number[];
}

export interface ChartSpec {
	chartType: ChartType;
	title?: string;
	description?: string;
	categories: string[];
	series: ChartSeries[];
	stacked?: boolean;
	xAxisLabel?: string;
	yAxisLabel?: string;
}

export interface TableSpec {
	title?: string;
	columns: string[];
	rows: string[][];
	highlightColumn?: number;
	caption?: string;
}

export type StatTrend = 'up' | 'down' | 'flat';

export interface StatCard {
	label: string;
	value: string;
	delta?: string;
	trend?: StatTrend;
	help?: string;
}

export interface StatCardsSpec {
	title?: string;
	cards: StatCard[];
}

export type ParseResult<T> =
	| { status: 'ready'; spec: T }
	| { status: 'pending'; title?: string };

// ─── low-level guards ─────────────────────────────────────────────────────────

function asObject(input: unknown): Record<string, unknown> | null {
	return input && typeof input === 'object' && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: null;
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function numberArray(v: unknown): number[] {
	return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
}

function stringArray(v: unknown): string[] {
	return Array.isArray(v) ? v.map((s) => (typeof s === 'string' ? s : String(s ?? ''))) : [];
}

// ─── normalizers ───────────────────────────────────────────────────────────────

const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie'];

export function parseChartSpec(input: unknown): ParseResult<ChartSpec> {
	const obj = asObject(input);
	const title = str(obj?.['title']);
	if (!obj) return { status: 'pending' };

	const chartType = str(obj['chartType']) as ChartType | undefined;
	const categories = stringArray(obj['categories']);
	const rawSeries = Array.isArray(obj['series']) ? (obj['series'] as unknown[]) : [];
	const series: ChartSeries[] = rawSeries
		.map((s) => {
			const so = asObject(s);
			if (!so) return null;
			return { name: str(so['name']) ?? '', data: numberArray(so['data']) };
		})
		.filter((s): s is ChartSeries => s !== null && s.data.length > 0);

	// Enough to draw: a known type, some categories, and at least one series with data.
	const ready = chartType && CHART_TYPES.includes(chartType) && categories.length > 0 && series.length > 0;
	if (!ready) return { status: 'pending', title };

	return {
		status: 'ready',
		spec: {
			chartType,
			title,
			description: str(obj['description']),
			categories,
			series,
			stacked: typeof obj['stacked'] === 'boolean' ? (obj['stacked'] as boolean) : undefined,
			xAxisLabel: str(obj['xAxisLabel']),
			yAxisLabel: str(obj['yAxisLabel']),
		},
	};
}

export function parseTableSpec(input: unknown): ParseResult<TableSpec> {
	const obj = asObject(input);
	const title = str(obj?.['title']);
	if (!obj) return { status: 'pending' };

	const columns = stringArray(obj['columns']);
	const rawRows = Array.isArray(obj['rows']) ? (obj['rows'] as unknown[]) : [];
	const rows = rawRows.filter(Array.isArray).map((r) => stringArray(r));

	if (columns.length === 0 || rows.length === 0) return { status: 'pending', title };

	const highlight = obj['highlightColumn'];
	return {
		status: 'ready',
		spec: {
			title,
			columns,
			rows,
			highlightColumn: typeof highlight === 'number' ? highlight : undefined,
			caption: str(obj['caption']),
		},
	};
}

const TRENDS: StatTrend[] = ['up', 'down', 'flat'];

export function parseStatCardsSpec(input: unknown): ParseResult<StatCardsSpec> {
	const obj = asObject(input);
	const title = str(obj?.['title']);
	if (!obj) return { status: 'pending' };

	const rawCards = Array.isArray(obj['cards']) ? (obj['cards'] as unknown[]) : [];
	const cards: StatCard[] = [];
	for (const c of rawCards) {
		const co = asObject(c);
		const label = str(co?.['label']);
		const value = str(co?.['value']);
		if (!co || label === undefined || value === undefined) continue;
		const card: StatCard = { label, value };
		const delta = str(co['delta']);
		if (delta !== undefined) card.delta = delta;
		const trend = str(co['trend']) as StatTrend | undefined;
		if (trend && TRENDS.includes(trend)) card.trend = trend;
		const help = str(co['help']);
		if (help !== undefined) card.help = help;
		cards.push(card);
	}

	if (cards.length === 0) return { status: 'pending', title };
	return { status: 'ready', spec: { title, cards } };
}
