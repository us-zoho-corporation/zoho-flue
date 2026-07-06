import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import { A2uiFrame } from './Frame.tsx';
import type { StatCard, StatCardsSpec, StatTrend } from './spec.ts';

const TREND_META: Record<StatTrend, { icon: typeof TrendUp; className: string }> = {
	up: { icon: TrendUp, className: 'text-green-600' },
	down: { icon: TrendDown, className: 'text-red-600' },
	flat: { icon: Minus, className: 'text-kumo-subtle' },
};

function Card({ card }: { card: StatCard }) {
	const trend = card.trend ? TREND_META[card.trend] : null;
	const TrendIcon = trend?.icon;
	return (
		<div className="a2ui-stat-card flex-1 min-w-[140px] rounded-lg border border-kumo-line bg-kumo-tint/40 px-3.5 py-3">
			<p className="text-xs text-kumo-subtle truncate" title={card.label}>{card.label}</p>
			<div className="flex items-baseline gap-2 mt-1">
				<span className="text-xl font-semibold text-kumo-default tabular-nums">{card.value}</span>
				{card.delta && (
					<span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend?.className ?? 'text-kumo-subtle'}`}>
						{TrendIcon && <TrendIcon size={12} weight="bold" />}
						{card.delta}
					</span>
				)}
			</div>
			{card.help && <p className="text-[11px] text-kumo-inactive mt-1">{card.help}</p>}
		</div>
	);
}

export function A2uiStatCards({ spec }: { spec: StatCardsSpec }) {
	return (
		<A2uiFrame title={spec.title}>
			<div className="a2ui-stat-cards flex flex-wrap gap-2.5">
				{spec.cards.map((card, i) => <Card key={i} card={card} />)}
			</div>
		</A2uiFrame>
	);
}
