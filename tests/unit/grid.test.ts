import { buildGrid, validateGrid } from '../../src/grid/build-grid';
import type { GridCell } from '../../src/grid/types';
const cell = (row = 0, column = 0, colSpan = 1, rowSpan = 1): GridCell => ({
	clientId: `${row}:${column}`,
	row,
	column,
	colSpan,
	rowSpan,
});
test('maps explicit origins independently of saved order', () => {
	const grid = buildGrid(
		[cell(1, 1), cell(0, 0), cell(1, 0), cell(0, 1)],
		2,
		2
	);
	expect(validateGrid(grid)).toEqual([]);
	expect(grid.slots[1][1]).toEqual({
		origin: { rowIndex: 1, cellIndex: 0, clientId: '1:1' },
		isOrigin: true,
	});
});
test('retains rows completely covered by a vertical merge', () => {
	const grid = buildGrid([cell(0, 0, 2, 3)], 3, 2);
	expect(validateGrid(grid)).toEqual([]);
	expect(grid.slots[2][1]?.origin.clientId).toBe('0:0');
	expect(grid.slots[2][1]?.isOrigin).toBe(false);
});
test('rejects overlap, gaps, bounds and invalid coordinates', () => {
	expect(
		validateGrid(buildGrid([cell(0, 0, 2), cell(0, 1)], 1, 2))
	).toContain('overlap');
	expect(validateGrid(buildGrid([cell()], 2, 2))).toContain('gap');
	expect(validateGrid(buildGrid([cell(1)], 1, 1))).toContain('out-of-bounds');
	expect(validateGrid(buildGrid([cell(-1)], 1, 1))).toContain(
		'invalid-position'
	);
});
test.each([0, -1, 1.5, NaN, Infinity])('rejects invalid span %s', (span) => {
	expect(validateGrid(buildGrid([cell(0, 0, span)], 1, 2))).toContain(
		'invalid-span'
	);
});
test.each([0, -1, 1.5, NaN, Infinity, 101])(
	'bounds row allocation %s',
	(count) => {
		expect(validateGrid(buildGrid([], count, 2))).toContain(
			'invalid-dimensions'
		);
	}
);
test.each([0, -1, 1.5, NaN, Infinity, 51])(
	'bounds column allocation %s',
	(count) => {
		expect(validateGrid(buildGrid([], 2, count))).toContain(
			'invalid-dimensions'
		);
	}
);
test('does not mutate frozen input, including invalid rectangles', () => {
	const input = Object.freeze([Object.freeze(cell(0, 0, 2, 2))]);
	expect(() => buildGrid(input, 1, 1)).not.toThrow();
	expect(input[0]).toEqual(cell(0, 0, 2, 2));
});
