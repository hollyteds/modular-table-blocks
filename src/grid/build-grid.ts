import { TABLE_LIMITS } from './limits';
import type { Grid, GridCell } from './types';

// Error codes are translated by the UI, not by this pure calculation.
export function buildGrid(
	cells: readonly GridCell[],
	rowCount: number,
	columnCount: number
): Grid {
	const errors: string[] = [];
	if (
		!Number.isInteger(rowCount) ||
		rowCount < 1 ||
		rowCount > TABLE_LIMITS.rows ||
		!Number.isInteger(columnCount) ||
		columnCount < 1 ||
		columnCount > TABLE_LIMITS.columns
	) {
		return {
			width: 0,
			height: 0,
			slots: [],
			errors: ['invalid-dimensions'],
		};
	}
	const slots: Grid['slots'] = Array.from({ length: rowCount }, () =>
		Array(columnCount).fill(null)
	);
	cells.forEach((cell, cellIndex) => {
		const { row, column, colSpan, rowSpan } = cell;
		if (![row, column].every(Number.isInteger) || row < 0 || column < 0) {
			errors.push('invalid-position');
			return;
		}
		if (
			![colSpan, rowSpan].every(Number.isInteger) ||
			colSpan < 1 ||
			rowSpan < 1
		) {
			errors.push('invalid-span');
			return;
		}
		if (column + colSpan > columnCount || row + rowSpan > rowCount) {
			errors.push('out-of-bounds');
			return;
		}
		for (let r = row; r < row + rowSpan; r++) {
			for (let c = column; c < column + colSpan; c++) {
				if (slots[r][c]) {
					errors.push('overlap');
					return;
				}
			}
		}
		const origin = { rowIndex: row, cellIndex, clientId: cell.clientId };
		for (let r = row; r < row + rowSpan; r++) {
			for (let c = column; c < column + colSpan; c++) {
				slots[r][c] = { origin, isOrigin: r === row && c === column };
			}
		}
	});
	return { width: columnCount, height: rowCount, slots, errors };
}

export function validateGrid(grid: Grid): string[] {
	return [
		...grid.errors,
		...(grid.slots.some((row) => row.includes(null)) ? ['gap'] : []),
	];
}
