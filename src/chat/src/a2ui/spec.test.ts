import { describe, test, expect } from 'vitest';
import {
	isA2uiTool,
	parseChartSpec,
	parseTableSpec,
	parseStatCardsSpec,
} from './spec.ts';

describe('isA2uiTool', () => {
	test('recognizes a2ui tools and rejects others', () => {
		expect(isA2uiTool('render_chart')).toBe(true);
		expect(isA2uiTool('render_comparison_table')).toBe(true);
		expect(isA2uiTool('render_stat_cards')).toBe(true);
		expect(isA2uiTool('zoho_kb_search')).toBe(false);
		expect(isA2uiTool('zoho_api')).toBe(false);
	});
});

describe('parseChartSpec', () => {
	test('is pending while the spec is still streaming in', () => {
		// Partial inputs that arrive as the model streams tokens.
		expect(parseChartSpec(undefined).status).toBe('pending');
		expect(parseChartSpec({}).status).toBe('pending');
		expect(parseChartSpec({ chartType: 'bar' }).status).toBe('pending');
		expect(parseChartSpec({ chartType: 'bar', categories: ['A', 'B'] }).status).toBe('pending');
		// Series present but no data points yet.
		expect(parseChartSpec({ chartType: 'bar', categories: ['A'], series: [{ name: 'x', data: [] }] }).status)
			.toBe('pending');
	});

	test('surfaces a title while pending so the skeleton can label itself', () => {
		const r = parseChartSpec({ title: 'Revenue by region', chartType: 'bar' });
		expect(r.status).toBe('pending');
		if (r.status === 'pending') expect(r.title).toBe('Revenue by region');
	});

	test('is ready once type, categories, and a series with data exist', () => {
		const r = parseChartSpec({
			chartType: 'bar',
			title: 'Editions',
			categories: ['Free', 'Standard', 'Pro'],
			series: [{ name: 'Users', data: [10, 40, 25] }],
			yAxisLabel: 'Users',
		});
		expect(r.status).toBe('ready');
		if (r.status === 'ready') {
			expect(r.spec.chartType).toBe('bar');
			expect(r.spec.categories).toEqual(['Free', 'Standard', 'Pro']);
			expect(r.spec.series[0].data).toEqual([10, 40, 25]);
			expect(r.spec.yAxisLabel).toBe('Users');
		}
	});

	test('drops malformed series and non-numeric data defensively', () => {
		const r = parseChartSpec({
			chartType: 'line',
			categories: ['Q1', 'Q2'],
			series: [
				{ name: 'good', data: [1, 2] },
				'garbage',
				{ name: 'mixed', data: [3, 'x', 4] },
			],
		});
		expect(r.status).toBe('ready');
		if (r.status === 'ready') {
			expect(r.spec.series).toHaveLength(2);
			expect(r.spec.series[1].data).toEqual([3, 4]);
		}
	});

	test('rejects an unknown chart type', () => {
		const r = parseChartSpec({ chartType: 'donut', categories: ['A'], series: [{ name: 'x', data: [1] }] });
		expect(r.status).toBe('pending');
	});
});

describe('parseTableSpec', () => {
	test('is pending without columns or rows', () => {
		expect(parseTableSpec({ columns: ['A', 'B'] }).status).toBe('pending');
		expect(parseTableSpec({ rows: [['1', '2']] }).status).toBe('pending');
	});

	test('is ready with columns and rows and preserves highlight', () => {
		const r = parseTableSpec({
			title: 'Plan comparison',
			columns: ['Feature', 'Free', 'Pro'],
			rows: [['Seats', '1', 'Unlimited'], ['SLA', 'No', 'Yes']],
			highlightColumn: 2,
			caption: 'Pro recommended',
		});
		expect(r.status).toBe('ready');
		if (r.status === 'ready') {
			expect(r.spec.columns).toHaveLength(3);
			expect(r.spec.rows).toHaveLength(2);
			expect(r.spec.highlightColumn).toBe(2);
			expect(r.spec.caption).toBe('Pro recommended');
		}
	});
});

describe('parseStatCardsSpec', () => {
	test('is pending until at least one complete card exists', () => {
		expect(parseStatCardsSpec({ cards: [] }).status).toBe('pending');
		// A card missing its value is not yet renderable.
		expect(parseStatCardsSpec({ cards: [{ label: 'Tickets' }] }).status).toBe('pending');
	});

	test('is ready and keeps optional delta/trend/help', () => {
		const r = parseStatCardsSpec({
			title: 'This week',
			cards: [
				{ label: 'Tickets', value: '1,204', delta: '+12%', trend: 'up' },
				{ label: 'CSAT', value: '96%', help: 'rolling 7 days' },
			],
		});
		expect(r.status).toBe('ready');
		if (r.status === 'ready') {
			expect(r.spec.cards).toHaveLength(2);
			expect(r.spec.cards[0].trend).toBe('up');
			expect(r.spec.cards[0].delta).toBe('+12%');
			expect(r.spec.cards[1].help).toBe('rolling 7 days');
			expect(r.spec.cards[1].trend).toBeUndefined();
		}
	});

	test('ignores an invalid trend value', () => {
		const r = parseStatCardsSpec({ cards: [{ label: 'X', value: '1', trend: 'sideways' }] });
		expect(r.status).toBe('ready');
		if (r.status === 'ready') expect(r.spec.cards[0].trend).toBeUndefined();
	});
});
