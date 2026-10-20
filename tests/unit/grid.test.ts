import { buildGrid, validateGrid } from '../../src/grid/build-grid';
import type { GridCell } from '../../src/grid/types';

const cell = (clientId: string, colSpan = 1, rowSpan = 1): GridCell => ({
	clientId,
	colSpan,
	rowSpan,
});

describe('M0 grid validation', () => {
	it('maps every origin in a 2×2 table', () => {
		const grid = buildGrid(
			[
				[cell('a'), cell('b')],
				[cell('c'), cell('d')],
			],
			2
		);
		expect(validateGrid(grid)).toEqual([]);
		expect(grid.slots[1][1]).toEqual({
			origin: { rowIndex: 1, cellIndex: 1, clientId: 'd' },
			isOrigin: true,
		});
	});
	it('tracks merged occupancy without duplicating content', () => {
		const grid = buildGrid([[cell('a', 1, 2), cell('b')], [cell('c')]], 2);
		expect(validateGrid(grid)).toEqual([]);
		expect(grid.slots[1][0]?.origin.clientId).toBe('a');
		expect(grid.slots[1][0]?.isOrigin).toBe(false);
	});
	it('rejects overlapping merged rectangles', () => {
		const grid = buildGrid(
			[[cell('a'), cell('b', 1, 2)], [cell('c', 2)]],
			2
		);
		expect(validateGrid(grid)).toContain('overlap');
	});
	it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid span %s', (span) => {
		expect(validateGrid(buildGrid([[cell('a', span)]], 2))).toContain(
			'invalid-span'
		);
	});
	it('detects gaps, extra cells and spans outside rows', () => {
		expect(validateGrid(buildGrid([[cell('a')]], 2))).toContain('gap');
		expect(validateGrid(buildGrid([[cell('a'), cell('b')]], 1))).toContain(
			'out-of-bounds'
		);
		expect(validateGrid(buildGrid([[cell('a', 1, 2)]], 1))).toContain(
			'out-of-bounds'
		);
	});
	it.each([0, -1, 1.5, NaN, Infinity, 51])(
		'bounds allocation for column count %s',
		(count) => {
			expect(validateGrid(buildGrid([], count))).toContain(
				'invalid-dimensions'
			);
		}
	);
	it('does not mutate input, including rejected data', () => {
		const input = Object.freeze([
			Object.freeze([Object.freeze(cell('a', 2, 2))]),
		]);
		expect(() => buildGrid(input, 1)).not.toThrow();
		expect(input[0][0]).toEqual(cell('a', 2, 2));
	});
});
