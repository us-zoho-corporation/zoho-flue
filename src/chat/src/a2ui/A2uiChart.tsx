import { Chart, type KumoChartOption } from '@cloudflare/kumo';
import * as echarts from 'echarts';
import { useMemo } from 'react';
import { A2uiFrame } from './Frame.tsx';
import type { ChartSpec } from './spec.ts';

// Kumo categorical palette, indexed by series position.
const PALETTE = ['#2C7BE5', '#EEB720', '#E8649D', '#8D58EE', '#50C3B6', '#D37536'];

// Colors tuned for the light chat surface so axes/labels stay legible without
// ECharts' built-in theme (which would paint its own background).
const AXIS = 'rgba(17, 24, 39, 0.55)';
const SPLIT = 'rgba(17, 24, 39, 0.1)';
const LABEL = 'rgba(17, 24, 39, 0.9)';

function buildOption(spec: ChartSpec): KumoChartOption {
	const { chartType, categories, series, stacked } = spec;
	const multi = series.length > 1;

	const base: KumoChartOption = {
		color: PALETTE,
		backgroundColor: 'transparent',
		textStyle: { color: LABEL, fontFamily: 'Inter, system-ui, sans-serif' },
		grid: { left: 8, right: 16, top: multi || chartType === 'pie' ? 36 : 16, bottom: 8, containLabel: true },
		legend: (multi || chartType === 'pie')
			? { top: 0, textStyle: { color: AXIS }, icon: 'circle', itemHeight: 8, itemWidth: 8 }
			: undefined,
	};

	if (chartType === 'pie') {
		const data = categories.map((name, i) => ({ name, value: series[0]?.data[i] ?? 0 }));
		return {
			...base,
			tooltip: { trigger: 'item' },
			series: [
				{
					type: 'pie',
					radius: ['42%', '68%'],
					center: ['50%', '56%'],
					avoidLabelOverlap: true,
					itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
					label: { color: AXIS, fontSize: 11 },
					data,
				},
			],
		};
	}

	const isArea = chartType === 'area';
	const seriesType = chartType === 'bar' ? 'bar' : 'line';

	return {
		...base,
		tooltip: { trigger: 'axis', axisPointer: { type: chartType === 'bar' ? 'shadow' : 'line' } },
		xAxis: {
			type: 'category',
			data: categories,
			name: spec.xAxisLabel,
			nameLocation: 'middle',
			nameGap: 28,
			nameTextStyle: { color: AXIS },
			axisLine: { lineStyle: { color: SPLIT } },
			axisLabel: { color: AXIS, fontSize: 11 },
			axisTick: { show: false },
		},
		yAxis: {
			type: 'value',
			name: spec.yAxisLabel,
			nameTextStyle: { color: AXIS, align: 'left' },
			axisLabel: { color: AXIS, fontSize: 11 },
			splitLine: { lineStyle: { color: SPLIT } },
		},
		series: series.map((s) => ({
			name: s.name,
			type: seriesType,
			data: s.data,
			stack: stacked ? 'total' : undefined,
			smooth: seriesType === 'line',
			showSymbol: false,
			areaStyle: isArea ? { opacity: 0.18 } : undefined,
			barMaxWidth: 42,
			itemStyle: seriesType === 'bar' ? { borderRadius: [3, 3, 0, 0] } : undefined,
		})),
	};
}

export function A2uiChart({ spec }: { spec: ChartSpec }) {
	const options = useMemo(() => buildOption(spec), [spec]);
	return (
		<A2uiFrame title={spec.title} caption={spec.description}>
			<Chart echarts={echarts} options={options} height={280} className="a2ui-chart w-full" />
		</A2uiFrame>
	);
}
