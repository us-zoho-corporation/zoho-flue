import { LayerCard, Loader } from '@cloudflare/kumo';
import type { ReactNode } from 'react';

/**
 * Shared chrome for every a2ui surface: an optional title, the body, and an
 * optional caption. Keeps charts, tables, and stat cards visually consistent
 * inside the assistant message.
 */
export function A2uiFrame({
	title,
	caption,
	children,
}: {
	title?: string;
	caption?: string;
	children: ReactNode;
}) {
	return (
		<LayerCard className="a2ui-frame px-4 py-3.5 mt-2 w-full min-w-0">
			{title && <h3 className="a2ui-title text-sm font-semibold text-kumo-default mb-2.5">{title}</h3>}
			{children}
			{caption && <p className="a2ui-caption text-xs text-kumo-subtle mt-2">{caption}</p>}
		</LayerCard>
	);
}

/** Placeholder shown while a spec is still streaming in and not yet renderable. */
export function A2uiPending({ title }: { title?: string }) {
	return (
		<A2uiFrame title={title}>
			<div className="a2ui-skeleton flex items-center gap-2 py-6 justify-center">
				<Loader size="sm" />
				<span className="text-xs text-kumo-subtle">Preparing visualization…</span>
			</div>
		</A2uiFrame>
	);
}
