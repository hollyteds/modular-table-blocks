import {
	backgroundRule,
	backgroundMarkers,
	inheritedCellBackground,
} from '../../src/styles/background';
import { planOperation } from '../../src/grid/operations';
import {
	planBulkUpdate,
	projectBulkPlan,
	projectBulkDraft,
	stageBulkPatch,
	emptyBulkDraft,
	structureSignature,
	resolvedFieldValue,
} from '../../src/styles/bulk';
import { tokenStyle } from '../../src/styles/tokens';

const all = { mode: 'all' as const, all: true, indices: [] };
function table() {
	const source = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 4, columns: 3 }
	).changes!;
	source.innerBlocks.forEach((cell, i) => {
		cell.clientId = `cell-${i}`;
	});
	Object.assign(source.attributes, {
		headerRows: 1,
		stripeMode: 'rows',
		styleTokens: {
			headerBackgroundColor: '#123456',
			stripeBackgroundColor: '#abcdef',
			cellBackgroundColor: '#ffffff',
		},
	});
	return source;
}

test('row stripes count body rows and manual headers never become stripes', () => {
	const t = table();
	expect(
		t.innerBlocks.map((c) => backgroundRule(t.attributes, c.attributes))
	).toEqual([
		'header',
		'header',
		'header',
		undefined,
		undefined,
		undefined,
		'stripe',
		'stripe',
		'stripe',
		undefined,
		undefined,
		undefined,
	]);
	expect(backgroundRule(t.attributes, { row: 2, column: 1, tag: 'th' })).toBe(
		'header'
	);
});
test('column stripes use logical origins including headers and spans', () => {
	const t = { stripeMode: 'columns' };
	expect(
		backgroundRule(t, { row: 2, column: 2, colSpan: 2 })
	).toBeUndefined();
	expect(
		backgroundRule(t, { row: 2, column: 1, rowSpan: 2, colSpan: 2 })
	).toBe('stripe');
	expect(backgroundRule(t, { row: 2, column: 1, tag: 'th' })).toBe('header');
});
test('invalid coordinates and modes do not produce stripe markers', () => {
	for (const row of [-1, 100, 0.5, '2', null]) {
		expect(
			backgroundRule({ stripeMode: 'rows' }, { row, column: 1 })
		).toBeUndefined();
	}
	expect(
		backgroundRule({ stripeMode: 'bad' }, { row: 1, column: 1 })
	).toBeUndefined();
});
test('unset markers add no default style; explicit transparent wins and invalid colors are rejected', () => {
	expect(backgroundMarkers({}, { row: 0, column: 0 })).toEqual({
		'data-mtb-bg': undefined,
		'data-mtb-bg-local': undefined,
	});
	expect(tokenStyle({})).toEqual({});
	expect(
		backgroundMarkers(
			{},
			{ styleTokens: { cellBackgroundColor: 'transparent' } }
		)['data-mtb-bg-local']
	).toBe('');
	expect(
		backgroundMarkers(
			{},
			{ styleTokens: { cellBackgroundColor: 'url(evil)' } }
		)['data-mtb-bg-local']
	).toBeUndefined();
	expect(
		inheritedCellBackground(
			{
				stripeMode: 'rows',
				styleTokens: { stripeBackgroundColor: 'url(evil)' },
			},
			{ row: 1, column: 0 }
		)
	).toBeUndefined();
	expect(
		tokenStyle({
			headerBackgroundColor: '#123456',
			stripeBackgroundColor: 'var(--wp--preset--color--accent)',
		})
	).toEqual({
		'--mtb-cell-header-bg': '#123456',
		'--mtb-cell-stripe-bg': 'var(--wp--preset--color--accent)',
	});
});
test('all-cell background retains only overrides needed to cover rules, in preview and application', () => {
	const t = table();
	const before = JSON.stringify(t);
	const draft = stageBulkPatch(t, emptyBulkDraft(), all, {
		cellBackgroundColor: '#ffffff',
	});
	for (const next of [
		projectBulkDraft(t, draft),
		projectBulkPlan(
			t,
			planBulkUpdate(t, structureSignature(t), all, {
				cellBackgroundColor: '#ffffff',
			})
		),
	]) {
		for (const cell of next.innerBlocks) {
			expect(
				resolvedFieldValue(next, cell.attributes, 'cellBackgroundColor')
			).toBe('#ffffff');
			expect(
				(
					cell.attributes.styleTokens as {
						cellBackgroundColor?: string;
					}
				)?.cellBackgroundColor
			).toBe(
				backgroundRule(next.attributes, cell.attributes)
					? '#ffffff'
					: undefined
			);
		}
	}
	expect(JSON.stringify(t)).toBe(before);
});
test('partial bulk edits preserve unrelated pattern overrides and clear only position-redundant values', () => {
	const t = table();
	t.innerBlocks[7].attributes.styleTokens = {
		cellBackgroundColor: '#ffffff',
	};
	t.innerBlocks[8].attributes.styleTokens = {
		cellBackgroundColor: '#abcdef',
	};
	const next = projectBulkPlan(
		t,
		planBulkUpdate(
			t,
			structureSignature(t),
			{ mode: 'rows', all: false, indices: [1] },
			{ cellBackgroundColor: '#ffffff' }
		)
	);
	expect(next.innerBlocks[7].attributes.styleTokens).toMatchObject({
		cellBackgroundColor: '#ffffff',
	});
	expect(next.innerBlocks[8].attributes.styleTokens).toEqual({});
	expect(
		resolvedFieldValue(
			next,
			next.innerBlocks[7].attributes,
			'cellBackgroundColor'
		)
	).toBe('#ffffff');
});
test('clearing an individual override restores its header or stripe rule', () => {
	const t = table();
	t.innerBlocks[6].attributes.styleTokens = {
		cellBackgroundColor: 'transparent',
	};
	const next = projectBulkPlan(
		t,
		planBulkUpdate(
			t,
			structureSignature(t),
			{ mode: 'rows', all: false, indices: [2] },
			{ cellBackgroundColor: undefined }
		)
	);
	expect(
		resolvedFieldValue(
			next,
			next.innerBlocks[6].attributes,
			'cellBackgroundColor'
		)
	).toBe('#abcdef');
});
test('a uniform color can be hoisted without changing rule settings or exposing a pattern', () => {
	const t = table();
	for (const cell of t.innerBlocks) {
		cell.attributes.styleTokens = { cellBackgroundColor: '#ff0000' };
	}
	t.innerBlocks[3].attributes.styleTokens = {
		cellBackgroundColor: '#00ff00',
	};
	const next = projectBulkPlan(
		t,
		planBulkUpdate(
			t,
			structureSignature(t),
			{ mode: 'rows', all: false, indices: [1] },
			{ cellBackgroundColor: '#ff0000' }
		)
	);
	expect(next.attributes.styleTokens).toEqual({
		headerBackgroundColor: '#123456',
		stripeBackgroundColor: '#abcdef',
		cellBackgroundColor: '#ff0000',
	});
	for (const cell of next.innerBlocks) {
		expect(
			resolvedFieldValue(next, cell.attributes, 'cellBackgroundColor')
		).toBe('#ff0000');
	}
});

test.each([
	{
		mode: 'rows',
		operation: { type: 'insertRow' as const, index: 1 },
		id: 'cell-3',
		rule: 'stripe',
	},
	{
		mode: 'rows',
		operation: { type: 'deleteRow' as const, index: 1 },
		id: 'cell-6',
		rule: undefined,
	},
	{
		mode: 'rows',
		operation: { type: 'moveRow' as const, index: 1, destination: 2 },
		id: 'cell-3',
		rule: 'stripe',
	},
	{
		mode: 'columns',
		operation: { type: 'insertColumn' as const, index: 1 },
		id: 'cell-4',
		rule: undefined,
	},
	{
		mode: 'columns',
		operation: { type: 'deleteColumn' as const, index: 0 },
		id: 'cell-4',
		rule: undefined,
	},
	{
		mode: 'columns',
		operation: { type: 'moveColumn' as const, index: 1, destination: 2 },
		id: 'cell-4',
		rule: undefined,
	},
])(
	'recomputes $mode after $operation.type without persisting stripe values',
	({ mode, operation, id, rule }) => {
		const t = table();
		t.attributes.stripeMode = mode;
		const before = JSON.stringify(t);
		const plan = planOperation(t, operation);
		expect(plan.errors).toEqual([]);
		const next = plan.changes!;
		const moved = next.innerBlocks.find((cell) => cell.clientId === id)!;
		expect(backgroundRule(next.attributes, moved.attributes)).toBe(rule);
		expect(next.attributes.styleTokens).toEqual(t.attributes.styleTokens);
		expect(moved.attributes.styleTokens).toBeUndefined();
		expect(JSON.stringify(t)).toBe(before);
	}
);
