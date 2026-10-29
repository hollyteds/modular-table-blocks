import { Button } from '@wordpress/components';
import { useLayoutEffect, useRef, useState } from '@wordpress/element';
import type { CSSProperties, ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import type { BlockTree } from '../grid/operations';
import { placements } from '../grid/layout';
import {
	selectBulkAxis,
	toggleBulkAll,
	owns,
	draftCellPatches,
	draftTablePatch,
} from '../styles/bulk';
import BulkSelectionOverlay from './bulk-selection-overlay';
import type { BulkSelection, BulkDraft } from '../styles/bulk';
import { previewStyle, previewTableContext } from '../styles/bulk-preview';
import type { PreviewEnvironment } from '../styles/bulk-preview';
import { validColumnWidth, columnWidthMode } from '../styles/columns';
import { isBorderCollapse } from '../styles/border-layout';
import { backgroundMarkers } from '../styles/background';
import { effectiveCellTag } from '../grid/cell-type';
import { hasExplicitFontWeight } from '../styles/native';

function SelectionButton({
	selected,
	...props
}: {
	selected: boolean;
	children: ReactNode;
	onClick: () => void;
	'aria-label': string;
}) {
	return (
		<Button
			{...props}
			aria-pressed={selected}
			variant={selected ? 'primary' : undefined}
		/>
	);
}

export default function BulkSelectionPreview({
	table,
	environment,
	selection,
	draft,
	onChange,
}: {
	table: BlockTree;
	environment: PreviewEnvironment;
	selection: BulkSelection;
	draft: BulkDraft;
	onChange: (next: BulkSelection) => void;
}) {
	const cells = placements(table);
	const pendingCells = draftCellPatches(draft);
	const tablePatch = draftTablePatch(draft);
	const tableContext = previewTableContext(environment, tablePatch);
	const columns = table.attributes.columns as { width?: string }[];
	const widthMode = columnWidthMode(table.attributes);
	const tableRef = useRef<HTMLTableElement>(null);
	const [minimumWidth, setMinimumWidth] = useState<number>();
	useLayoutEffect(() => {
		const element = tableRef.current;
		if (!element || widthMode !== 'equal') {
			setMinimumWidth(undefined);
			return;
		}
		const content = Array.from(
			element.querySelectorAll<HTMLElement>(
				'.modular-table-blocks-bulk-preview-measure'
			)
		);
		const measure = () => {
			const tableStyle = getComputedStyle(element);
			const gap =
				tableStyle.borderCollapse === 'separate'
					? parseFloat(tableStyle.borderSpacing)
					: 0;
			let columnMinimum = 0;
			for (const sample of content) {
				const cell = sample.parentElement as HTMLTableCellElement;
				const style = getComputedStyle(cell);
				const edges = [
					style.paddingLeft,
					style.paddingRight,
					style.borderLeftWidth,
					style.borderRightWidth,
				].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
				columnMinimum = Math.max(
					columnMinimum,
					parseFloat(style.minWidth) || 0,
					(sample.scrollWidth + edges - gap * (cell.colSpan - 1)) /
						cell.colSpan
				);
			}
			const axis = element.querySelector<HTMLElement>(
				'tbody .modular-table-blocks-bulk-preview-axis'
			);
			const gutter = axis
				? parseFloat(getComputedStyle(axis).minWidth) || 0
				: 0;
			setMinimumWidth(
				Math.ceil(
					columnMinimum * columns.length +
						gutter +
						gap * (columns.length + 2) +
						2
				)
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		const viewport = element.closest('.modular-table-blocks-bulk__preview');
		if (viewport) {
			observer.observe(viewport);
		}
		for (const sample of content) {
			observer.observe(sample);
		}
		return () => observer.disconnect();
	}, [table, environment, draft, widthMode, columns.length]);
	const allSelected = selection.mode === 'all' && selection.all;
	return (
		<div
			className="modular-table-blocks-bulk__preview"
			role="region"
			aria-label={__('Cell selection', 'modular-table-blocks')}
			tabIndex={0}
			style={{
				fontSize: environment.parent?.fontSize,
				lineHeight: environment.parent?.lineHeight,
				textAlign: environment.parent?.textAlign,
			}}
		>
			<BulkSelectionOverlay selection={selection}>
				<table
					ref={tableRef}
					data-mtb-column-width-mode={widthMode}
					data-mtb-font-weight={
						hasExplicitFontWeight(table.attributes)
							? 'inherit'
							: undefined
					}
					data-mtb-border-collapse={
						isBorderCollapse(table.attributes.borderCollapse)
							? table.attributes.borderCollapse
							: undefined
					}
					className="modular-table-blocks-bulk-preview-table"
					style={{
						...tableContext,
						...previewStyle(table.attributes),
						// A definite width keeps the native fixed layout in equal mode.
						width:
							widthMode === 'equal' && minimumWidth !== undefined
								? `max(100%, ${minimumWidth}px)`
								: undefined,
						...(!owns(tablePatch, 'fontSize') &&
						environment.table.fontSize !== undefined
							? { fontSize: environment.table.fontSize }
							: {}),
					}}
				>
					<caption>
						{__('Cell selection', 'modular-table-blocks')}
					</caption>
					<colgroup
						style={
							widthMode === 'equal'
								? ({
										'--mtb-column-count': columns.length,
									} as CSSProperties)
								: undefined
						}
					>
						<col className="modular-table-blocks-bulk-preview-gutter" />
						{columns.map((column, index) => (
							<col
								key={index}
								style={{
									width:
										widthMode === 'custom' &&
										validColumnWidth(column?.width)
											? column.width
											: undefined,
								}}
							/>
						))}
					</colgroup>
					<thead>
						<tr>
							<th className="modular-table-blocks-bulk-preview-axis modular-table-blocks-bulk-preview-corner">
								<SelectionButton
									aria-label={__(
										'All cells',
										'modular-table-blocks'
									)}
									selected={allSelected}
									onClick={() =>
										onChange(toggleBulkAll(selection))
									}
								>
									▦
								</SelectionButton>
							</th>
							{columns.map((_column, column) => (
								<th
									scope="col"
									className="modular-table-blocks-bulk-preview-axis"
									key={column}
								>
									<SelectionButton
										selected={
											allSelected ||
											(selection.mode === 'columns' &&
												selection.indices.includes(
													column
												))
										}
										onClick={() =>
											onChange(
												selectBulkAxis(
													selection,
													'columns',
													column
												)
											)
										}
										aria-label={sprintf(
											// translators: %d: column number.
											__(
												'Column %d',
												'modular-table-blocks'
											),
											column + 1
										)}
									>
										{column + 1}
									</SelectionButton>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{Array.from(
							{ length: Number(table.attributes.rowCount) },
							(_, r) => (
								<tr key={r}>
									<th
										scope="row"
										className="modular-table-blocks-bulk-preview-axis"
									>
										<SelectionButton
											selected={
												allSelected ||
												(selection.mode === 'rows' &&
													selection.indices.includes(
														r
													))
											}
											onClick={() =>
												onChange(
													selectBulkAxis(
														selection,
														'rows',
														r
													)
												)
											}
											aria-label={sprintf(
												// translators: %d: row number.
												__(
													'Row %d',
													'modular-table-blocks'
												),
												r + 1
											)}
										>
											{r + 1}
										</SelectionButton>
									</th>
									{cells
										.filter((p) => p.row === r)
										.map((p) => (
											<td
												key={p.cell.clientId}
												{...backgroundMarkers(
													table.attributes,
													p.cell.attributes
												)}
												colSpan={p.width}
												rowSpan={p.height}
												aria-describedby={`mtb-preview-type-${p.cell.clientId}`}
												className={`modular-table-blocks-bulk-preview-cell${effectiveCellTag(table.attributes, p.cell.attributes) === 'th' ? ' is-header' : ''}`}
												style={{
													...environment.blocks[
														p.cell.clientId
													],
													...previewStyle(
														p.cell.attributes
													),
													...(!owns(
														pendingCells[
															p.cell.clientId
														] ?? {},
														'fontSize'
													) &&
													environment.fontSizes[
														p.cell.clientId
													] !== undefined
														? {
																fontSize:
																	environment
																		.fontSizes[
																		p.cell
																			.clientId
																	],
															}
														: {}),
												}}
												aria-label={sprintf(
													// translators: %1$d: row number, %2$d: column number.
													__(
														'Cell at row %1$d, column %2$d',
														'modular-table-blocks'
													),
													p.row + 1,
													p.column + 1
												)}
											>
												<span
													id={`mtb-preview-type-${p.cell.clientId}`}
													className="modular-table-blocks-bulk-preview-type"
												>
													{effectiveCellTag(
														table.attributes,
														p.cell.attributes
													).toUpperCase()}
												</span>
												<span
													className="modular-table-blocks-bulk-preview-measure"
													aria-hidden="true"
												>
													{p.row + 1}:{p.column + 1}
												</span>
												{p.row + 1}:{p.column + 1}
											</td>
										))}
								</tr>
							)
						)}
					</tbody>
				</table>
			</BulkSelectionOverlay>
		</div>
	);
}
