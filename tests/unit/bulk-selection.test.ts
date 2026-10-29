import { selectionBoxes } from '../../src/styles/bulk-selection';
import type { BulkSelection } from '../../src/styles/bulk';

const columns = [
	{ start: 48, end: 98 },
	{ start: 98, end: 248 },
	{ start: 248, end: 308 },
];
const rows = [
	{ start: 80, end: 120 },
	{ start: 120, end: 240 },
	{ start: 240, end: 290 },
];
const all: BulkSelection = { mode: 'all', all: true, indices: [] };

test('all cells have one outer outline and clearing selection removes it', () => {
	expect(selectionBoxes(all, columns, rows)).toEqual([
		{ left: 48, top: 80, width: 260, height: 210 },
	]);
	expect(selectionBoxes({ ...all, all: false }, columns, rows)).toEqual([]);
	expect(selectionBoxes(all, [], rows)).toEqual([]);
	expect(selectionBoxes(all, columns, [])).toEqual([]);
});

test('adjacent rows share one outline without an intermediate selection line', () => {
	expect(
		selectionBoxes({ ...all, mode: 'rows', indices: [0, 1] }, columns, rows)
	).toEqual([{ left: 48, top: 80, width: 260, height: 160 }]);
});

test('adjacent columns use their real unequal widths in a single outline', () => {
	expect(
		selectionBoxes(
			{ ...all, mode: 'columns', indices: [1, 2] },
			columns,
			rows
		)
	).toEqual([{ left: 98, top: 80, width: 210, height: 210 }]);
});

test('non-contiguous rows and columns retain a separate outline for each run', () => {
	expect(
		selectionBoxes({ ...all, mode: 'rows', indices: [0, 2] }, columns, rows)
	).toEqual([
		{ left: 48, top: 80, width: 260, height: 40 },
		{ left: 48, top: 240, width: 260, height: 50 },
	]);
	expect(
		selectionBoxes(
			{ ...all, mode: 'columns', indices: [0, 2] },
			columns,
			rows
		)
	).toEqual([
		{ left: 48, top: 80, width: 50, height: 210 },
		{ left: 248, top: 80, width: 60, height: 210 },
	]);
});

test('unsorted and repeated indices do not mutate selection, tracks or fill gaps', () => {
	const selection: BulkSelection = {
		...all,
		mode: 'rows',
		indices: [2, 0, 2, -1, 8, 1.5],
	};
	const before = JSON.stringify([selection, columns, rows]);
	expect(selectionBoxes(selection, columns, rows)).toHaveLength(2);
	expect(JSON.stringify([selection, columns, rows])).toBe(before);
	expect(
		selectionBoxes({ ...selection, indices: [] }, columns, rows)
	).toEqual([]);
});
