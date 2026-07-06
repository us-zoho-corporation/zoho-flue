import { Component, type ReactNode } from 'react';
import { A2uiChart } from './A2uiChart.tsx';
import { A2uiStatCards } from './A2uiStatCards.tsx';
import { A2uiTable } from './A2uiTable.tsx';
import { A2uiFrame, A2uiPending } from './Frame.tsx';
import { parseChartSpec, parseStatCardsSpec, parseTableSpec, type A2uiToolName } from './spec.ts';

export interface A2uiToolPart {
	toolCallId: string;
	toolName: string;
	state: 'input-available' | 'output-available' | 'output-error';
	input: unknown;
}

/**
 * Contains render failures from model-authored visualizations. The spec is
 * untrusted model output; a pathological (but structurally "ready") spec could
 * throw inside a renderer (e.g. ECharts). Without this, one bad chart would
 * crash the whole chat tree — instead it degrades to a small notice.
 */
class A2uiBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	componentDidCatch(error: unknown) { console.error('[a2ui] visualization render failed:', error); }
	render() {
		if (this.state.failed) {
			return (
				<A2uiFrame>
					<div className="a2ui-error text-xs text-kumo-subtle py-4 text-center">
						Couldn’t render this visualization.
					</div>
				</A2uiFrame>
			);
		}
		return this.props.children;
	}
}

/**
 * Renders one a2ui tool call. The spec is read from the tool INPUT, which
 * streams in incrementally, so a partial spec shows a pending placeholder and
 * the real surface swaps in once enough data has arrived. An errored tool call
 * still renders whatever spec streamed before the error. Wrapped in a boundary
 * so a bad spec degrades gracefully instead of crashing the chat.
 */
export function A2uiPart({ part }: { part: A2uiToolPart }) {
	return (
		<A2uiBoundary key={part.state}>
			<A2uiPartInner part={part} />
		</A2uiBoundary>
	);
}

function A2uiPartInner({ part }: { part: A2uiToolPart }) {
	const name = part.toolName as A2uiToolName;

	if (name === 'render_chart') {
		const r = parseChartSpec(part.input);
		return r.status === 'ready' ? <A2uiChart spec={r.spec} /> : <A2uiPending title={r.title} />;
	}
	if (name === 'render_comparison_table') {
		const r = parseTableSpec(part.input);
		return r.status === 'ready' ? <A2uiTable spec={r.spec} /> : <A2uiPending title={r.title} />;
	}
	if (name === 'render_stat_cards') {
		const r = parseStatCardsSpec(part.input);
		return r.status === 'ready' ? <A2uiStatCards spec={r.spec} /> : <A2uiPending title={r.title} />;
	}
	return null;
}
