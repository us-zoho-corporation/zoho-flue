import { Table } from '@cloudflare/kumo';
import { A2uiFrame } from './Frame.tsx';
import type { TableSpec } from './spec.ts';

/**
 * Renders a ready `TableSpec` as a Kumo table inside an `A2uiFrame`, using the
 * spec's title/caption for the frame header/footer and shading the
 * `highlightColumn` (if any) to draw attention to it.
 * @param props - Component props.
 * @param props.spec - The normalized, ready-to-render table spec.
 * @returns The framed, scrollable table element.
 */
export function A2uiTable({ spec }: { spec: TableSpec }) {
	const { columns, rows, highlightColumn } = spec;

	/**
	 * Checks whether a given column index is the spec's highlighted column.
	 * @param col - Zero-based column index.
	 * @returns `true` if `col` matches `spec.highlightColumn`.
	 */
	const isHighlighted = (col: number) => highlightColumn === col;

	return (
		<A2uiFrame title={spec.title} caption={spec.caption}>
			<div className="a2ui-table-scroll overflow-x-auto">
				<Table>
					<Table.Header>
						<Table.Row>
							{columns.map((label, c) => (
								<Table.Head
									key={c}
									className={isHighlighted(c) ? 'text-kumo-default font-semibold bg-kumo-tint' : undefined}
								>
									{label}
								</Table.Head>
							))}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{rows.map((row, r) => (
							<Table.Row key={r}>
								{columns.map((_, c) => (
									<Table.Cell
										key={c}
										className={
											(c === 0 ? 'font-medium text-kumo-default ' : '')
											+ (isHighlighted(c) ? 'bg-kumo-tint' : '')
										}
									>
										{row[c] ?? ''}
									</Table.Cell>
								))}
							</Table.Row>
						))}
					</Table.Body>
				</Table>
			</div>
		</A2uiFrame>
	);
}
