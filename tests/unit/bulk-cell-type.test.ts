import { effectiveCellTag } from '../../src/grid/cell-type';
import { planOperation } from '../../src/grid/operations';
import {
	emptyBulkDraft,
	stageBulkPatch,
	clearBulkFields,
	projectBulkDraft,
	projectBulkPlan,
	planBulkDraft,
	structureSignature,
	resolvedFieldValue,
} from '../../src/styles/bulk';
import type { BulkSelection } from '../../src/styles/bulk';

const all: BulkSelection = { mode: 'all', all: true, indices: [] };
function table() {
	const result = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 3, columns: 3 }
	).changes!;
	result.attributes.headerRows = 1;
	result.innerBlocks.forEach((cell, index) => {
		cell.clientId = `cell-${index}`;
		cell.attributes.styleTokens = { cellBackgroundColor: '#abcdef' };
	});
	return result;
}
test('bulk types remain cell attributes, skip managed headers and never normalize into a table default', () => {
	const t = table();
	const before = JSON.stringify(t);
	const draft = stageBulkPatch(t, emptyBulkDraft(), all, { tag: 'th' });
	expect(draft.edits[0].global).toBe(false);
	expect(draft.edits[0].targets).toHaveLength(6);
	for (const next of [
		projectBulkDraft(t, draft),
		projectBulkPlan(t, planBulkDraft(t, structureSignature(t), draft)),
	]) {
		expect(next.attributes).toEqual(t.attributes);
		for (let i = 0; i < next.innerBlocks.length; i++) {
			expect(
				resolvedFieldValue(next, next.innerBlocks[i].attributes, 'tag')
			).toBe('th');
			expect(next.innerBlocks[i].attributes.tag).toBe(
				i < 3 ? undefined : 'th'
			);
			expect(next.innerBlocks[i].attributes.styleTokens).toEqual(
				t.innerBlocks[i].attributes.styleTokens
			);
			expect(next.innerBlocks[i].innerBlocks).toBe(
				t.innerBlocks[i].innerBlocks
			);
		}
	}
	expect(JSON.stringify(t)).toBe(before);
});
test('TD conversion clears header association only on its target cells', () => {
	const t = table();
	for (const cell of t.innerBlocks) {
		Object.assign(cell.attributes, { tag: 'th', scope: 'row' });
	}
	const draft = stageBulkPatch(
		t,
		emptyBulkDraft(),
		{ mode: 'columns', all: false, indices: [1] },
		{ tag: 'td' }
	);
	const next = projectBulkPlan(
		t,
		planBulkDraft(t, structureSignature(t), draft)
	);
	for (const cell of next.innerBlocks) {
		const targeted =
			cell.attributes.row !== 0 && cell.attributes.column === 1;
		expect(cell.attributes.tag).toBe(targeted ? 'td' : 'th');
		expect(cell.attributes.scope).toBe(targeted ? '' : 'row');
	}
});
test('mixed scopes keep independent drafts and Leave unchanged removes only the selected type edits', () => {
	const t = table();
	let draft = stageBulkPatch(
		t,
		emptyBulkDraft(),
		{ mode: 'rows', all: false, indices: [1, 2] },
		{ tag: 'th' }
	);
	draft = clearBulkFields(
		t,
		draft,
		{ mode: 'rows', all: false, indices: [2] },
		['tag']
	);
	const projected = projectBulkDraft(t, draft);
	expect(
		projected.innerBlocks.filter((c) => c.attributes.tag === 'th')
	).toHaveLength(3);
	expect(t.innerBlocks.some((c) => c.attributes.tag === 'th')).toBe(false);
});
test('partly intersecting merged body cells change once without changing spans or content', () => {
	const base = table();
	const t = planOperation(base, {
		type: 'mergeCells',
		top: 1,
		left: 0,
		bottom: 2,
		right: 1,
	}).changes!;
	const origin = t.innerBlocks.find(
		(c) => c.attributes.row === 1 && c.attributes.column === 0
	)!;
	const draft = stageBulkPatch(
		t,
		emptyBulkDraft(),
		{ mode: 'columns', all: false, indices: [1] },
		{ tag: 'th' }
	);
	expect(draft.edits[0].targets).toEqual([origin.clientId]);
	const next = projectBulkPlan(
		t,
		planBulkDraft(t, structureSignature(t), draft)
	);
	expect(
		next.innerBlocks.find((c) => c.clientId === origin.clientId)!.attributes
	).toEqual({ ...origin.attributes, tag: 'th' });
});
test('header-only selection cannot change managed types and a changed header boundary invalidates apply', () => {
	const t = table();
	expect(
		stageBulkPatch(
			t,
			emptyBulkDraft(),
			{ mode: 'rows', all: false, indices: [0] },
			{ tag: 'td' }
		).edits
	).toEqual([]);
	const draft = stageBulkPatch(t, emptyBulkDraft(), all, { tag: 'th' });
	expect(() =>
		planBulkDraft(
			{ ...t, attributes: { ...t.attributes, headerRows: 2 } },
			structureSignature(t),
			draft
		)
	).toThrow('stale-structure');
	expect(() =>
		planBulkDraft(t, structureSignature(t), {
			edits: [
				{
					field: 'tag',
					value: 'td',
					targets: ['cell-0'],
					global: false,
				},
			],
		})
	).toThrow('invalid-selection');
});
test.each([undefined, 'div', 'TH', '<th>'])(
	'rejects invalid type %s',
	(tag) => {
		const t = table();
		expect(() => stageBulkPatch(t, emptyBulkDraft(), all, { tag })).toThrow(
			'invalid-value'
		);
	}
);
test('effective tags honor header rows without changing the underlying attributes', () => {
	expect(effectiveCellTag({ headerRows: 1 }, { row: 0, tag: 'td' })).toBe(
		'th'
	);
	expect(effectiveCellTag({}, { row: 0 })).toBe('td');
});
