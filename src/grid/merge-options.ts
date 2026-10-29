import { headerCount, placements, tableGrid } from './layout';
import type { Placement } from './layout';
import { structureErrors } from './operations';
import type { BlockTree, TableOperation } from './operations';

export type MergeEndpoint = { row: number; column: number };
export type MergeOptions = {
	origin: Placement;
	bottom: number;
	right: number;
	endpoints: MergeEndpoint[];
	cells: Placement[];
};

/**
 * Enumerate complete rectangles from a fixed top-left cell in O(rows * columns).
 * Prefix maxima detect merged cells crossing any rectangle edge without cloning content.
 * @param table
 * @param cellId
 */
export function mergeOptions(
	table: BlockTree,
	cellId: string
): MergeOptions | null {
	if (structureErrors(table).length) {
		return null;
	}
	const cells = placements(table);
	const origin = cells.find((p) => p.cell.clientId === cellId);
	if (!origin) {
		return null;
	}
	const grid = tableGrid(table);
	const headers = headerCount(table);
	const limit = origin.row < headers ? headers : grid.height;
	const byCell = new Map(cells.map((p) => [p.cell, p]));
	const endpoints: MergeEndpoint[] = [];
	const bottomMax: number[][] = [];
	const rightMax: number[][] = [];
	const blocked: boolean[][] = [];
	let bottom = origin.row + origin.height - 1;
	let right = origin.column + origin.width - 1;
	for (let row = origin.row; row < limit; row++) {
		const r = row - origin.row;
		bottomMax[r] = [];
		rightMax[r] = [];
		blocked[r] = [];
		for (let column = origin.column; column < grid.width; column++) {
			const c = column - origin.column;
			const p = byCell.get(
				table.innerBlocks[grid.slots[row][column]!.origin.cellIndex]
			)!;
			bottomMax[r][c] = Math.max(
				p.row + p.height - 1,
				bottomMax[r - 1]?.[c] ?? -1,
				bottomMax[r][c - 1] ?? -1
			);
			rightMax[r][c] = Math.max(
				p.column + p.width - 1,
				rightMax[r - 1]?.[c] ?? -1,
				rightMax[r][c - 1] ?? -1
			);
			blocked[r][c] =
				p.row < origin.row ||
				p.column < origin.column ||
				!!blocked[r - 1]?.[c] ||
				!!blocked[r][c - 1];
			if (
				!blocked[r][c] &&
				bottomMax[r][c] <= row &&
				rightMax[r][c] <= column &&
				(r + 1) * (c + 1) > origin.width * origin.height
			) {
				endpoints.push({ row, column });
				bottom = Math.max(bottom, row);
				right = Math.max(right, column);
			}
		}
	}
	return {
		origin,
		bottom,
		right,
		endpoints,
		cells: cells.filter(
			(p) =>
				p.row <= bottom &&
				p.row + p.height > origin.row &&
				p.column <= right &&
				p.column + p.width > origin.column
		),
	};
}

export function mergeEndpointOperation(
	options: MergeOptions,
	endpoint: MergeEndpoint
): TableOperation {
	return {
		type: 'mergeCells',
		top: options.origin.row,
		left: options.origin.column,
		bottom: endpoint.row,
		right: endpoint.column,
	};
}
