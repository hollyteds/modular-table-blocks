import {
	mergeOptions,
	mergeEndpointOperation,
} from '../../src/grid/merge-options';
import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree } from '../../src/grid/operations';

function table(rows = 4, columns = 4): BlockTree {
	return {
		clientId: 'table',
		name: 'modular-table-blocks/table',
		attributes: {
			rowCount: rows,
			columns: Array.from({ length: columns }, () => ({})),
		},
		innerBlocks: Array.from({ length: rows * columns }, (_, i) => ({
			clientId: `cell-${i}`,
			name: 'modular-table-blocks/cell',
			attributes: { row: Math.floor(i / columns), column: i % columns },
			innerBlocks: [],
		})),
	};
}
const merged = (
	source: BlockTree,
	top: number,
	left: number,
	bottom: number,
	right: number
) =>
	planOperation(source, { type: 'mergeCells', top, left, bottom, right })
		.changes!;

test('a fixed origin exposes the maximum available extent without selecting itself', () => {
	const source = table();
	const next = mergeOptions(source, 'cell-5')!;
	expect(next.origin).toMatchObject({ row: 1, column: 1 });
	expect([next.bottom, next.right]).toEqual([3, 3]);
	expect(next.endpoints).toHaveLength(8);
	expect(next.endpoints).not.toContainEqual({ row: 1, column: 1 });
	expect(next.cells).toHaveLength(9);
	expect(mergeOptions(source, 'cell-15')!.endpoints).toEqual([]);
	expect(mergeOptions(source, 'missing')).toBeNull();
});

test('existing merged origins require a larger complete rectangle', () => {
	const source = merged(table(), 0, 0, 1, 1);
	const options = mergeOptions(source, 'cell-0')!;
	expect(options.endpoints).not.toContainEqual({ row: 1, column: 1 });
	expect(options.endpoints).not.toContainEqual({ row: 0, column: 2 });
	expect(options.endpoints).toContainEqual({ row: 1, column: 2 });
	expect(mergeEndpointOperation(options, { row: 2, column: 3 })).toEqual({
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 2,
		right: 3,
	});
});

test('crossing cells limit the visible domain while other complete rectangles remain available', () => {
	const source = merged(table(), 0, 1, 1, 2);
	const options = mergeOptions(source, 'cell-4')!;
	expect([options.bottom, options.right]).toEqual([3, 0]);
	expect(options.endpoints).toEqual([
		{ row: 2, column: 0 },
		{ row: 3, column: 0 },
	]);
});

test('header boundaries restrict the domain and invalid grids have no options', () => {
	const source = table();
	source.attributes.headerRows = 1;
	expect(mergeOptions(source, 'cell-0')!.bottom).toBe(0);
	expect(mergeOptions(source, 'cell-4')!.endpoints).toContainEqual({
		row: 3,
		column: 3,
	});
	source.innerBlocks.pop();
	expect(mergeOptions(source, 'cell-0')).toBeNull();
});

test('all offered endpoints exactly match the operation planner across merged layouts', () => {
	const ordinary = table();
	const across = merged(ordinary, 0, 1, 1, 2);
	const nested = merged(merged(table(), 1, 1, 2, 2), 0, 3, 2, 3);
	const headers = {
		...nested,
		attributes: { ...nested.attributes, headerRows: 1 },
	};
	for (const source of [ordinary, across, nested, headers]) {
		if (structureErrors(source).length) {
			continue;
		}
		const before = JSON.stringify(source);
		for (const cell of source.innerBlocks) {
			const options = mergeOptions(source, cell.clientId)!;
			const expected = [];
			for (let row = options.origin.row; row < 4; row++) {
				for (let column = options.origin.column; column < 4; column++) {
					const endpoint = { row, column };
					if (
						!planOperation(
							source,
							mergeEndpointOperation(options, endpoint)
						).errors.length
					) {
						expected.push(endpoint);
					}
				}
			}
			expect(options.endpoints).toEqual(expected);
		}
		expect(JSON.stringify(source)).toBe(before);
	}
});

test('maximum size does not require planning or materializing every candidate tree', () => {
	const options = mergeOptions(table(100, 50), 'cell-0')!;
	expect(options.endpoints).toHaveLength(4999);
	expect([options.bottom, options.right]).toEqual([99, 49]);
});
