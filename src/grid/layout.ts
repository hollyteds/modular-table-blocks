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
		table.innerBlocks.map((cell) => ({
			clientId: cell.clientId,
			row: cell.attributes.row as number,
			column: cell.attributes.column as number,
			colSpan: span(cell.attributes.colSpan),
			rowSpan: span(cell.attributes.rowSpan),
		})),
		table.attributes.rowCount as number,
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
			const cell = table.innerBlocks[slot.origin.cellIndex];
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

export function placeCells(cells: Placement[]): BlockTree[] {
	return [...cells]
		.sort((a, b) => a.row - b.row || a.column - b.column)
		.map((p) => {
			const cell = withSpan(p.cell, p.width, p.height);
			return cell.attributes.row === p.row &&
				cell.attributes.column === p.column
				? cell
				: {
						...cell,
						attributes: {
							...cell.attributes,
							row: p.row,
							column: p.column,
						},
					};
		});
}

export function headerCount(table: BlockTree): number {
	const value = table.attributes.headerRows;
	return typeof value === 'number' && Number.isInteger(value)
		? Math.max(0, Math.min(Number(table.attributes.rowCount) || 0, value))
		: 0;
}
