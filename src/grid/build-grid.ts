import type { Grid, GridCell } from './types';

// Error codes are translated by the UI, not by this pure calculation.
export function buildGrid(
	rows: readonly (readonly GridCell[])[],
	columnCount: number
): Grid {
	const errors: string[] = [];
	if (
		!Number.isInteger(columnCount) ||
		columnCount < 1 ||
		columnCount > 50 ||
		rows.length > 100
	) {
		return {
			width: 0,
			height: rows.length,
			slots: [],
			errors: ['invalid-dimensions'],
		};
	}
	const slots: Grid['slots'] = Array.from({ length: rows.length }, () =>
		Array(columnCount).fill(null)
	);
	rows.forEach((row, rowIndex) => {
		let column = 0;
		row.forEach((cell, cellIndex) => {
			while (column < columnCount && slots[rowIndex][column]) {
				column++;
			}
			const { colSpan, rowSpan } = cell;
			if (
				!Number.isInteger(colSpan) ||
				!Number.isInteger(rowSpan) ||
				colSpan < 1 ||
				rowSpan < 1
			) {
				errors.push('invalid-span');
				return;
			}
			if (
				column + colSpan > columnCount ||
				rowIndex + rowSpan > rows.length
			) {
				errors.push('out-of-bounds');
				return;
			}
			for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
				for (let c = column; c < column + colSpan; c++) {
					if (slots[r][c]) {
						errors.push('overlap');
						return;
					}
				}
			}
			const origin = { rowIndex, cellIndex, clientId: cell.clientId };
			for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
				for (let c = column; c < column + colSpan; c++) {
					slots[r][c] = {
						origin,
						isOrigin: r === rowIndex && c === column,
					};
				}
			}
			column += colSpan;
		});
	});
	return { width: columnCount, height: rows.length, slots, errors };
}

export function validateGrid(grid: Grid): string[] {
	return [
		...grid.errors,
		...(grid.slots.some((row) => row.includes(null)) ? ['gap'] : []),
	];
}
