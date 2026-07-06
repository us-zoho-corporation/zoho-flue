import { describe, test, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { A2uiPart } from './A2uiPart.tsx';

// Browser-mode tests: render the a2ui surfaces in real headless Chromium.
// Run via `pnpm test:browser` — excluded from the default `pnpm test`.
describe('A2uiPart (browser)', () => {
	test('shows a pending skeleton while a chart spec is still streaming', async () => {
		const screen = await render(
			<A2uiPart
				part={{ toolCallId: 'c1', toolName: 'render_chart', state: 'input-available', input: { title: 'Revenue' } }}
			/>,
		);
		await expect.element(screen.getByText('Preparing visualization…')).toBeInTheDocument();
		await expect.element(screen.getByText('Revenue')).toBeInTheDocument();
	});

	test('renders a bar chart frame with its title and caption once ready', async () => {
		const screen = await render(
			<A2uiPart
				part={{
					toolCallId: 'c2',
					toolName: 'render_chart',
					state: 'output-available',
					input: {
						chartType: 'bar',
						title: 'Users by edition',
						description: 'Active seats per plan',
						categories: ['Free', 'Standard', 'Pro'],
						series: [{ name: 'Users', data: [10, 40, 25] }],
					},
				}}
			/>,
		);
		await expect.element(screen.getByText('Users by edition')).toBeInTheDocument();
		await expect.element(screen.getByText('Active seats per plan')).toBeInTheDocument();
	});

	test('renders a comparison table with headers and cells', async () => {
		const screen = await render(
			<A2uiPart
				part={{
					toolCallId: 'c3',
					toolName: 'render_comparison_table',
					state: 'output-available',
					input: {
						title: 'Plans',
						columns: ['Feature', 'Free', 'Pro'],
						rows: [['Seats', '1', 'Unlimited']],
						highlightColumn: 2,
					},
				}}
			/>,
		);
		await expect.element(screen.getByText('Plans')).toBeInTheDocument();
		await expect.element(screen.getByText('Unlimited')).toBeInTheDocument();
	});

	test('renders stat cards with value and delta', async () => {
		const screen = await render(
			<A2uiPart
				part={{
					toolCallId: 'c4',
					toolName: 'render_stat_cards',
					state: 'output-available',
					input: { cards: [{ label: 'Tickets', value: '1,204', delta: '+12%', trend: 'up' }] },
				}}
			/>,
		);
		await expect.element(screen.getByText('1,204')).toBeInTheDocument();
		await expect.element(screen.getByText('+12%')).toBeInTheDocument();
	});
});
