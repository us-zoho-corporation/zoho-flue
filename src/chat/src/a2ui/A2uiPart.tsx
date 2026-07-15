import { Component, type ReactNode } from 'react';
import { A2uiChart } from './A2uiChart.tsx';
import { A2uiRecordCard } from './A2uiRecordCard.tsx';
import { A2uiStatCards } from './A2uiStatCards.tsx';
import { A2uiTable } from './A2uiTable.tsx';
import { A2uiFrame, A2uiPending } from './Frame.tsx';
import { parseChartSpec, parseRecordCardSpec, parseStatCardsSpec, parseTableSpec, type A2uiToolName } from './spec.ts';

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
	override state = { failed: false };

	/**
	 * React error-boundary hook: flips the boundary into its failed state
	 * whenever a descendant throws during render.
	 * @returns The partial state update marking the boundary as failed.
	 */
	static getDerivedStateFromError() { return { failed: true }; }

	/**
	 * Logs a render failure caught by the boundary for diagnostics.
	 * @param error - The error thrown by a descendant renderer.
	 */
	override componentDidCatch(error: unknown) { console.error('[a2ui] visualization render failed:', error); }

	/**
	 * Renders the wrapped children, or a small framed error notice once a
	 * descendant has thrown.
	 * @returns The children, or a fallback error notice element.
	 */
	override render() {
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
 * @param props - Component props.
 * @param props.part - The a2ui tool-call part to render.
 * @returns The boundary-wrapped visualization (or pending placeholder) for `part`.
 */
export function A2uiPart({ part }: { part: A2uiToolPart }) {
	return (
		<A2uiBoundary key={part.state}>
			<A2uiPartInner part={part} />
		</A2uiBoundary>
	);
}

/**
 * Parses `part.input` against the spec matching `part.toolName` and renders
 * either the ready visualization (chart, comparison table, or stat cards) or
 * a pending placeholder while the spec is still streaming in.
 * @param props - Component props.
 * @param props.part - The a2ui tool-call part to render.
 * @returns The rendered visualization, a pending placeholder, or `null` for an unrecognized tool name.
 */
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
	if (name === 'render_record_card') {
		const r = parseRecordCardSpec(part.input);
		return r.status === 'ready' ? <A2uiRecordCard spec={r.spec} /> : <A2uiPending title={r.title} />;
	}
	return null;
}
