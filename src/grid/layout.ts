import { buildGrid } from './build-grid';
import type { BlockTree } from './operations';

export interface Placement {
	row: number;
	column: number;
	width: number;
	height: number;
	cell: BlockTree;
}

function span(value: unknown): number {
	if (value === undefined) {
		return 1;
	}
	return typeof value === 'number' && Number.isInteger(value) ? value : NaN;
}

export function tableGrid(table: BlockTree) {
	return buildGrid(
		table.innerBlocks.map((row) =>
			row.innerBlocks.map((cell) => ({
				clientId: cell.clientId,
				colSpan: span(cell.attributes.colSpan),
				rowSpan: span(cell.attributes.rowSpan),
			}))
		),
		Array.isArray(table.attributes.columns)
			? table.attributes.columns.length
			: 0
	);
}

export function placements(table: BlockTree): Placement[] {
	const grid = tableGrid(table);
	return grid.slots.flatMap((row, r) =>
		row.flatMap((slot, c) => {
			if (!slot?.isOrigin) {
				return [];
			}
			const cell =
				table.innerBlocks[slot.origin.rowIndex].innerBlocks[
					slot.origin.cellIndex
				];
			return [
				{
					row: r,
					column: c,
					width: (cell.attributes.colSpan as number | undefined) ?? 1,
					height:
						(cell.attributes.rowSpan as number | undefined) ?? 1,
					cell,
				},
			];
		})
	);
}

export function withSpan(
	cell: BlockTree,
	width: number,
	height: number
): BlockTree {
	if (
		(cell.attributes.colSpan ?? 1) === width &&
		(cell.attributes.rowSpan ?? 1) === height
	) {
		return cell;
	}
	return {
		...cell,
		attributes: { ...cell.attributes, colSpan: width, rowSpan: height },
	};
}

export function placeRows(rows: BlockTree[], cells: Placement[]): BlockTree[] {
	const sorted = [...cells].sort(
		(a, b) => a.row - b.row || a.column - b.column
	);
	return rows.map((row, index) => {
		const children = sorted
			.filter((p) => p.row === index)
			.map((p) => withSpan(p.cell, p.width, p.height));
		return children.length === row.innerBlocks.length &&
			children.every((cell, i) => cell === row.innerBlocks[i])
			? row
			: { ...row, innerBlocks: children };
	});
}

export function headerCount(table: BlockTree): number {
	const value = table.attributes.headerRows;
	return typeof value === 'number' && Number.isInteger(value)
		? Math.max(0, Math.min(table.innerBlocks.length, value))
		: 0;
}
