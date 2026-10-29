import { planHeaderRow } from '../../src/grid/header-row';
import { planOperation } from '../../src/grid/operations';
import type { BlockTree } from '../../src/grid/operations';

function fixture(): BlockTree {
	const table = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 2, columns: 2 }
	).changes!;
	table.innerBlocks.forEach((cell, index) => {
		cell.clientId = `cell-${index}`;
	});
	return table;
}

test('header row replaces cell type and scope in one immutable attribute plan', () => {
	const table = fixture();
	const first = table.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	first.attributes = {
		...first.attributes,
		tag: 'th',
		scope: 'row',
		styleTokens: { cellBackgroundColor: '#123456' },
	};
	const before = JSON.stringify(table);
	const updates = planHeaderRow(table, true);
	expect(updates).toEqual({
		table: { headerRows: 1 },
		[table.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].clientId]: {
			tag: 'th',
			scope: 'col',
		},
		[table.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[1].clientId]: {
			tag: 'th',
			scope: 'col',
		},
	});
	expect(JSON.stringify(table)).toBe(before);
	table.attributes.headerRows = 1;
	const cleared = planHeaderRow(table, false);
	expect(cleared[first.clientId]).toEqual({ tag: 'td', scope: '' });
	expect(
		cleared[
			table.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 1
			)[0].clientId
		]
	).toBeUndefined();
});

test('header row accepts horizontal merges and rejects vertical crossings without changing input', () => {
	const table = fixture();
	const horizontal = planOperation(table, {
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 0,
		right: 1,
	}).changes!;
	expect(Object.keys(planHeaderRow(horizontal, true))).toHaveLength(2);
	const vertical = planOperation(table, {
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 1,
		right: 0,
	}).changes!;
	const before = JSON.stringify(vertical);
	expect(() => planHeaderRow(vertical, true)).toThrow('section-boundary');
	expect(JSON.stringify(vertical)).toBe(before);
	expect(() =>
		planHeaderRow({ ...table, attributes: { columns: [{}] } }, true)
	).toThrow('invalid-grid');
});
