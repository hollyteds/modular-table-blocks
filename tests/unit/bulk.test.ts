import {
	boxFields,
	draftCellPatches,
	resolvedFieldValue,
	selectsWholeTable,
	selectBulkAxis,
	toggleBulkAll,
	stageBulkPatch,
	emptyBulkDraft,
	projectBulkDraft,
	draftAffectedCells,
	planBulkDraft,
	clearBulkFields,
	boxPatch,
	commonTokens,
	commonBorderStyleDefaults,
	commonValue,
	crossesSelection,
	fieldValue,
	planBulkUpdate,
	selectedCells,
	selectionSides,
	cellsForField,
	structureSignature,
} from '../../src/styles/bulk';
import type { BulkPatch, BulkSelection } from '../../src/styles/bulk';
import { planOperation } from '../../src/grid/operations';
import type { BlockTree } from '../../src/grid/operations';
import {
	applyBorderValue,
	borderControlValue,
} from '../../src/styles/native-box';
import { sideValues } from '../../src/styles/sides';
import type { Side } from '../../src/styles/sides';
import { previewStyle } from '../../src/styles/bulk-preview';

const all: BulkSelection = { mode: 'all', all: true, indices: [] };

test('all-cell selection toggles off and replaces row or column selections without mutation', () => {
	for (const selection of [
		{ mode: 'all', all: false, indices: [] },
		{ mode: 'rows', all: false, indices: [0, 2] },
		{ mode: 'columns', all: false, indices: [1, 3] },
	] as BulkSelection[]) {
		const before = JSON.stringify(selection);
		expect(toggleBulkAll(selection)).toEqual(all);
		expect(JSON.stringify(selection)).toBe(before);
	}
	expect(toggleBulkAll(all)).toEqual({
		mode: 'all',
		all: false,
		indices: [],
	});
	expect(toggleBulkAll(toggleBulkAll(all))).toEqual(all);
});

function table(): BlockTree {
	const source = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 3, columns: 4 }
	).changes!;
	source.attributes.columns = [{ width: '25%' }, {}, {}, {}];
	source.attributes.styleTokens = { borderWidth: '1px' };
	source.innerBlocks.forEach((cell, index) => {
		const id = Math.floor(index / 4) * 5 + (index % 4) + 1;
		cell.clientId = `cell${id}`;
		Object.assign(cell.attributes, {
			styleTokens: {
				borderColor: (id + 1) % 2 ? '#123456' : '#abcdef',
				borderStyle: 'dashed',
				cellPaddingBlock: '0',
				cellPaddingInline: '7px',
			},
			style: {
				typography: { textAlign: 'right' },
				color: { text: '#aabbcc' },
			},
		});
	});
	return source;
}

const update = (
	source: BlockTree,
	selection: BulkSelection,
	patch: BulkPatch
) => planBulkUpdate(source, structureSignature(source), selection, patch);

test('vertical alignment drafts update only selected cells and preserve content, tokens and input', () => {
	const source = table();
	const before = JSON.stringify(source);
	const selection: BulkSelection = {
		mode: 'rows',
		all: false,
		indices: [0, 2],
	};
	const draft = stageBulkPatch(source, emptyBulkDraft(), selection, {
		verticalAlign: 'middle',
	});
	const projected = projectBulkDraft(source, draft);
	const updates = planBulkDraft(source, structureSignature(source), draft);
	expect(Object.keys(updates)).toHaveLength(8);
	for (const p of selectedCells(projected, selection)) {
		expect(updates[p.cell.clientId]).toEqual({ verticalAlign: 'middle' });
		expect(p.cell.attributes.styleTokens).toEqual(
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === p.row
			)[p.column].attributes.styleTokens
		);
		expect(previewStyle(p.cell.attributes).verticalAlign).toBe('middle');
	}
	expect(
		projected.innerBlocks.find((cell) => cell.attributes.row === 1)
	).toEqual(source.innerBlocks.find((cell) => cell.attributes.row === 1));
	expect(JSON.stringify(source)).toBe(before);
	expect(
		clearBulkFields(source, draft, selection, ['verticalAlign'])
	).toEqual(emptyBulkDraft());
});

test('horizontal alignment uses native typography while preserving other styles, contents and unselected rows', () => {
	const source = table();
	const before = JSON.stringify(source);
	const selection: BulkSelection = {
		mode: 'rows',
		all: false,
		indices: [0, 2],
	};
	const draft = stageBulkPatch(source, emptyBulkDraft(), selection, {
		textAlign: 'center',
		verticalAlign: 'middle',
		fontSize: '18px',
	});
	const projected = projectBulkDraft(source, draft);
	const updates = planBulkDraft(source, structureSignature(source), draft);
	expect(Object.keys(updates)).toHaveLength(8);
	for (const p of selectedCells(projected, selection)) {
		expect(p.cell.attributes.style).toEqual({
			typography: { textAlign: 'center', fontSize: '18px' },
			color: { text: '#aabbcc' },
		});
		expect(previewStyle(p.cell.attributes)).toMatchObject({
			textAlign: 'center',
			verticalAlign: 'middle',
		});
		expect(p.cell.attributes.styleTokens).toEqual(
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === p.row
			)[p.column].attributes.styleTokens
		);
		expect(p.cell.innerBlocks).toEqual(
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === p.row
			)[p.column].innerBlocks
		);
	}
	expect(
		projected.innerBlocks.find((cell) => cell.attributes.row === 1)
	).toEqual(source.innerBlocks.find((cell) => cell.attributes.row === 1));
	expect(
		draftCellPatches(
			clearBulkFields(source, draft, selection, ['textAlign'])
		)[Object.keys(draftCellPatches(draft))[0]]
	).toEqual({ verticalAlign: 'middle', fontSize: '18px' });
	expect(JSON.stringify(source)).toBe(before);
});

test('horizontal alignment resets native and legacy overrides to inheritance without restoring an old value', () => {
	const source = table();
	const cell = source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	cell.attributes.horizontalAlign = 'left';
	cell.attributes.style = {
		typography: { fontSize: '18px', lineHeight: '1.5' },
	};
	expect(fieldValue(cell.attributes, 'textAlign')).toBe('left');
	const before = JSON.stringify(source);
	const selection: BulkSelection = {
		mode: 'columns',
		all: false,
		indices: [0],
	};
	const draft = stageBulkPatch(source, emptyBulkDraft(), selection, {
		textAlign: undefined,
	});
	const projected = projectBulkDraft(source, draft);
	const next = projected.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	expect(fieldValue(next.attributes, 'textAlign')).toBeUndefined();
	expect(next.attributes.horizontalAlign).toBeUndefined();
	expect(next.attributes.style).toEqual({
		typography: { fontSize: '18px', lineHeight: '1.5' },
	});
	expect(
		projected.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[1]
	).toEqual(
		source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[1]
	);
	expect(JSON.stringify(source)).toBe(before);
	for (const value of [
		'inherit',
		'justify',
		'center;position:fixed',
		'',
		'middle',
	]) {
		expect(() => update(source, all, { textAlign: value })).toThrow(
			'invalid-value'
		);
	}
});

test('vertical alignment distinguishes mixed positions, defaults to top and rejects unsafe values', () => {
	const source = table();
	expect(
		stageBulkPatch(source, emptyBulkDraft(), all, { verticalAlign: 'top' })
			.edits
	).toEqual([
		expect.objectContaining({
			field: 'verticalAlign',
			value: 'top',
			global: true,
		}),
	]);
	source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0].attributes.verticalAlign = 'bottom';
	expect(
		commonValue(
			selectedCells(source, all).map((p) =>
				fieldValue(p.cell.attributes, 'verticalAlign')
			)
		).mixed
	).toBe(true);
	const updates = update(source, all, { verticalAlign: 'top' });
	expect(
		updates[
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].clientId
		]
	).toEqual({
		verticalAlign: undefined,
	});
	for (const value of ['center', 'baseline', 'middle;position:fixed', '']) {
		expect(() => update(source, all, { verticalAlign: value })).toThrow(
			'invalid-value'
		);
	}
	expect(
		source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.verticalAlign
	).toBe('bottom');
});

test('bulk style defaults reflect inheritance without creating patches or hiding mixed styles', () => {
	const source = table();
	for (const cell of source.innerBlocks) {
		cell.attributes.styleTokens = {};
	}
	let cells = selectedCells(source, all);
	const defaults = commonBorderStyleDefaults(source, cells);
	expect(defaults.top).toBe('solid');
	const tokens = commonTokens(cells, {});
	const next = applyBorderValue(
		tokens,
		{ ...borderControlValue(tokens, [], defaults), width: '3px' },
		[],
		defaults
	);
	expect(
		boxPatch(tokens, next, [
			...boxFields('borderWidth'),
			...boxFields('borderStyle'),
		])
	).toEqual(
		Object.fromEntries(
			boxFields('borderWidth').map((field) => [field, '3px'])
		)
	);
	expect(
		stageBulkPatch(
			source,
			emptyBulkDraft(),
			all,
			boxPatch(tokens, tokens, boxFields('borderStyle'))
		)
	).toEqual(emptyBulkDraft());
	source.attributes.styleTokens = { borderStyle: 'dashed' };
	source.innerBlocks
		.filter((candidate) => candidate.attributes.row === 0)
		.forEach((cell) => {
			cell.attributes.styleTokens = { borderTopStyle: 'dotted' };
		});
	cells = selectedCells(source, all);
	expect(commonBorderStyleDefaults(source, cells)).toEqual({
		right: 'dashed',
		bottom: 'dashed',
		left: 'dashed',
	});
	expect(
		commonBorderStyleDefaults(
			source,
			cells.filter((p) => p.row === 0)
		).top
	).toBe('dotted');
	source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 1
	)[0].attributes.styleTokens = {
		borderStyle: 'solid',
	};
	expect(
		commonBorderStyleDefaults(source, selectedCells(source, all))
	).toEqual({});
});

test('selects non-contiguous rows and columns, with all and empty modes', () => {
	const source = table();
	expect(
		selectedCells(source, { ...all, mode: 'rows', indices: [0, 2] })
	).toHaveLength(8);
	expect(
		selectedCells(source, { ...all, mode: 'columns', indices: [1, 3] })
	).toHaveLength(6);
	expect(selectedCells(source, all)).toHaveLength(12);
	expect(selectedCells(source, { ...all, all: false })).toHaveLength(0);
});

test('merged intersections count once and warn only when crossing the selection', () => {
	const merged = planOperation(table(), {
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 1,
		right: 1,
	}).changes!;
	const selection: BulkSelection = { ...all, mode: 'rows', indices: [1] };
	const cells = selectedCells(merged, selection);
	expect(cells).toHaveLength(3);
	expect(cells.filter((p) => crossesSelection(p, selection))).toHaveLength(1);
	expect(crossesSelection(cells[0], { ...selection, indices: [0, 1] })).toBe(
		false
	);
});

describe('merged cells keep edits inside the selected axis', () => {
	const mergedTable = () =>
		planOperation(table(), {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: 1,
			right: 1,
		}).changes!;
	const columns: BulkSelection = {
		mode: 'columns',
		indices: [1],
		all: false,
	};
	const rows: BulkSelection = { mode: 'rows', indices: [1], all: false };
	const patch: BulkPatch = {
		...Object.fromEntries(
			boxFields('padding').map((field) => [field, '20px'])
		),
		...Object.fromEntries(
			boxFields('borderWidth').map((field) => [field, '3px'])
		),
		...Object.fromEntries(
			boxFields('borderStyle').map((field) => [field, 'solid'])
		),
		...Object.fromEntries(
			boxFields('borderColor').map((field) => [field, '#ffaa00'])
		),
		cellBackgroundColor: '#ffaa00',
		fontSize: '20px',
		lineHeight: '1.8',
		verticalAlign: 'bottom',
		textAlign: 'center',
	};
	test.each<[BulkSelection, Side]>([
		[columns, 'right'],
		[rows, 'bottom'],
		[{ ...columns, indices: [0] }, 'left'],
		[{ ...rows, indices: [0] }, 'top'],
	])(
		'partial selection applies whole-cell fields and only the complete selected edge for %j',
		(selection, side) => {
			const source = mergedTable();
			const before = JSON.stringify(source);
			const merged = source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
			const p = selectedCells(source, selection)[0];
			expect(selectionSides(p, selection)).toEqual([side]);
			const draft = stageBulkPatch(
				source,
				emptyBulkDraft(),
				selection,
				patch
			);
			expect(draftCellPatches(draft)[merged.clientId]).toEqual({
				[`padding.${side}`]: '20px',
				[`borderWidth.${side}`]: '3px',
				[`borderStyle.${side}`]: 'solid',
				[`borderColor.${side}`]: '#ffaa00',
				cellBackgroundColor: '#ffaa00',
				fontSize: '20px',
				lineHeight: '1.8',
				verticalAlign: 'bottom',
				textAlign: 'center',
			});
			const direct = update(source, selection, patch);
			const planned = planBulkDraft(
				source,
				structureSignature(source),
				draft
			);
			expect(planned).toEqual(direct);
			const projected = projectBulkDraft(source, draft);
			const actual = projected.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
			for (const field of [
				'padding.top',
				'padding.right',
				'padding.bottom',
				'padding.left',
				'borderWidth.top',
				'borderWidth.right',
				'borderWidth.bottom',
				'borderWidth.left',
				'borderStyle.top',
				'borderStyle.right',
				'borderStyle.bottom',
				'borderStyle.left',
				'borderColor.top',
				'borderColor.right',
				'borderColor.bottom',
				'borderColor.left',
				'cellBackgroundColor',
				'fontSize',
				'lineHeight',
				'verticalAlign',
				'textAlign',
			] as const) {
				expect(fieldValue(actual.attributes, field)).toBe(
					!field.includes('.') || field.endsWith(`.${side}`)
						? patch[field]
						: fieldValue(merged.attributes, field)
				);
			}
			expect(actual.innerBlocks).toBe(merged.innerBlocks);
			expect(JSON.stringify(source)).toBe(before);
		}
	);
	test('non-contiguous selections preserve gaps and interior slices have no editable edge', () => {
		const source = planOperation(table(), {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: 1,
			right: 2,
		}).changes!;
		const p = selectedCells(source, all)[0];
		expect(selectionSides(p, { ...columns, indices: [0, 2] })).toEqual([
			'left',
			'right',
		]);
		expect(selectionSides(p, columns)).toEqual([]);
		const draft = stageBulkPatch(source, emptyBulkDraft(), columns, patch);
		expect(draftCellPatches(draft)[p.cell.clientId]).toEqual({
			cellBackgroundColor: '#ffaa00',
			fontSize: '20px',
			lineHeight: '1.8',
			verticalAlign: 'bottom',
			textAlign: 'center',
		});
		expect(draftAffectedCells(source, draft)).toHaveLength(2);
		expect(selectionSides(p, { ...all, all: false })).toEqual([]);
	});
	test('selecting every occupied index restores all edges and whole-cell settings', () => {
		const source = mergedTable();
		const selection = { ...columns, indices: [0, 1] };
		const cells = selectedCells(source, selection);
		expect(selectionSides(cells[0], selection)).toEqual([
			'top',
			'right',
			'bottom',
			'left',
		]);
		const draft = stageBulkPatch(
			source,
			emptyBulkDraft(),
			selection,
			patch
		);
		expect(draftCellPatches(draft)[cells[0].cell.clientId]).toEqual(patch);
		expect(cellsForField(cells, selection, 'fontSize')).toHaveLength(
			cells.length
		);
	});
	test('common values include intersecting merged areas and exclude unavailable edges', () => {
		const source = mergedTable();
		const merged = source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		merged.attributes.styleTokens = {
			cellPaddingBlock: '50px',
			cellPaddingInline: '60px',
			borderStyle: 'dotted',
		};
		merged.attributes.style = { typography: { fontSize: '30px' } };
		const cells = selectedCells(source, columns);
		expect(cellsForField(cells, columns, 'padding.top')).toHaveLength(1);
		expect(cellsForField(cells, columns, 'padding.right')).toHaveLength(2);
		const tokens = commonTokens(cells, {}, columns);
		expect(sideValues(tokens, 'padding')).toEqual({
			top: '0',
			bottom: '0',
			left: '7px',
		});
		expect(tokens.fontSize).toBeUndefined();
		expect(cellsForField(cells, columns, 'fontSize')).toHaveLength(2);
		expect(commonTokens([cells[0]], {}, columns).fontSize).toBe('30px');
		expect(
			cellsForField(
				selectedCells(source, all),
				{ ...columns, indices: [] },
				'fontSize'
			)
		).toHaveLength(0);
		expect(commonBorderStyleDefaults(source, cells, columns)).toEqual({
			top: 'dashed',
			bottom: 'dashed',
			left: 'dashed',
		});
	});
	test('partial edits, resets and leave unchanged keep drafts on excluded edges', () => {
		const source = mergedTable();
		const id = source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].clientId;
		let draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			'padding.top': '30px',
			'padding.right': '40px',
			fontSize: '24px',
		});
		draft = stageBulkPatch(source, draft, columns, {
			'padding.top': undefined,
			'padding.right': undefined,
			fontSize: undefined,
		});
		expect(draftCellPatches(draft)[id]).toEqual({
			'padding.top': '30px',
			'padding.right': undefined,
		});
		draft = stageBulkPatch(source, draft, columns, { fontSize: '20px' });
		draft = clearBulkFields(source, draft, columns, [
			'padding.top',
			'padding.right',
			'fontSize',
		]);
		expect(draftCellPatches(draft)[id]).toEqual({
			'padding.top': '30px',
		});
		const projected = projectBulkDraft(source, draft);
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'padding.right'
			)
		).toBe('7px');
	});
});

test('common values distinguish zero, inheritance and mixed values', () => {
	expect(commonValue(['0', '0'])).toEqual({ mixed: false, value: '0' });
	expect(commonValue([undefined, undefined])).toEqual({
		mixed: false,
		value: undefined,
	});
	expect(commonValue(['0', undefined])).toEqual({
		mixed: true,
		value: undefined,
	});
});

test('changing only border width preserves mixed colors, padding and untouched cells without mutating input', () => {
	const source = table();
	const before = JSON.stringify(source);
	const selection: BulkSelection = {
		...all,
		mode: 'columns',
		indices: [0, 2],
	};
	const cells = selectedCells(source, selection);
	const common = commonTokens(cells, {});
	const patch = boxPatch(
		common,
		applyBorderValue(common, { width: '3px', style: 'dashed' }, []),
		boxFields('borderWidth').concat(
			boxFields('borderColor'),
			boxFields('borderStyle')
		)
	);
	expect(Object.keys(patch)).toEqual(boxFields('borderWidth'));
	const updates = update(source, selection, patch);
	expect(Object.keys(updates)).toHaveLength(6);
	for (const { cell } of cells) {
		const tokens = updates[cell.clientId].styleTokens;
		expect(tokens).toMatchObject({
			borderColor: (
				cell.attributes.styleTokens as { borderColor: string }
			).borderColor,
			cellPaddingInline: '7px',
		});
		expect(updates[cell.clientId].style).toBeUndefined();
	}
	expect(JSON.stringify(source)).toBe(before);
});

test('side reset expands local shorthand, preserving other sides and explicit zero', () => {
	const source = table();
	const updates = update(source, all, { 'padding.top': undefined });
	expect(
		sideValues(
			updates[
				source.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			].styleTokens as {},
			'padding'
		)
	).toEqual({ bottom: '0', left: '7px', right: '7px' });
});

test('native zero-width normalization does not remove mixed cell colors or styles', () => {
	const source = table();
	const common = commonTokens(selectedCells(source, all), {});
	const fields = boxFields('borderWidth').concat(
		boxFields('borderColor'),
		boxFields('borderStyle')
	);
	const patch = boxPatch(
		common,
		applyBorderValue(common, { width: '0px', style: 'none' }, []),
		fields
	);
	expect(Object.keys(patch)).toEqual(boxFields('borderWidth'));
	const first = source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	expect(
		projectBulkDraft(
			source,
			stageBulkPatch(source, emptyBulkDraft(), all, patch)
		).innerBlocks.find((cell) => cell.clientId === first.clientId)!
			.attributes.styleTokens
	).toMatchObject({
		borderColor: (first.attributes.styleTokens as { borderColor: string })
			.borderColor,
		borderStyle: 'dashed',
	});
	expect(update(source, all, patch).table.styleTokens).toMatchObject({
		borderTopWidth: '0px',
	});
});

test('native typography overwrites and resets presets without losing other native properties', () => {
	const source = table();
	const first = source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	first.attributes.fontSize = 'large';
	const updates = update(source, all, {
		fontSize: '20px',
		lineHeight: '1.8',
	});
	expect(updates[first.clientId]).toMatchObject({
		style: {
			typography: {
				textAlign: 'right',
			},
			color: { text: '#aabbcc' },
		},
	});
	expect(updates.table.style).toMatchObject({
		typography: { fontSize: '20px', lineHeight: '1.8' },
	});
	expect(updates[first.clientId]).toHaveProperty('fontSize', undefined);
	expect(
		update(source, all, { fontSize: undefined })[first.clientId].style
	).toEqual(first.attributes.style);
});

test('column selection preserves column metadata while editing cells', () => {
	const source = table();
	const before = JSON.stringify(source.attributes.columns);
	const updates = update(
		source,
		{ ...all, mode: 'columns', indices: [1, 3] },
		{ cellBackgroundColor: 'transparent' }
	);
	expect(updates.table).toBeUndefined();
	expect(Object.keys(updates)).toHaveLength(6);
	expect(JSON.stringify(source.attributes.columns)).toBe(before);
});

test('stale geometry, order and column settings reject apply; content changes retain latest data', () => {
	const source = table();
	const signature = structureSignature(source);
	const changed = {
		...source,
		innerBlocks: [...source.innerBlocks].reverse(),
	};
	expect(() =>
		planBulkUpdate(changed, signature, all, { fontSize: '20px' })
	).toThrow('stale-structure');
	source.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0].innerBlocks = [
		{
			clientId: 'new-content',
			name: 'modular-table-blocks/cell-text',
			attributes: { content: 'New content' },
			innerBlocks: [],
		},
	];
	expect(() =>
		planBulkUpdate(source, signature, all, { fontSize: '20px' })
	).not.toThrow();
	source.attributes.columns = [{}, {}, {}];
	expect(() =>
		planBulkUpdate(source, signature, all, { fontSize: '20px' })
	).toThrow('stale-structure');
});

test('coordinate-only moves and covered-row count changes invalidate a bulk draft', () => {
	const source = table();
	const signature = structureSignature(source);
	const moved = {
		...source,
		innerBlocks: source.innerBlocks.map((cell) =>
			cell.attributes.row === 0
				? {
						...cell,
						attributes: {
							...cell.attributes,
							column: (Number(cell.attributes.column) + 1) % 4,
						},
					}
				: cell
		),
	};
	expect(() =>
		planBulkUpdate(moved, signature, all, { fontSize: '20px' })
	).toThrow('stale-structure');
	expect(() =>
		planBulkUpdate(
			{ ...source, attributes: { ...source.attributes, rowCount: 4 } },
			signature,
			all,
			{ fontSize: '20px' }
		)
	).toThrow('stale-structure');
});

test.each<BulkPatch>([
	{ 'padding.top': '-1px' },
	{ 'borderColor.left': 'url(evil)' },
	{ fontSize: '-1px' },
	{ lineHeight: '-1' },
	{ columnWidth: '100px' } as BulkPatch,
	{ unknown: '1px' } as BulkPatch,
])('rejects unsupported inputs %j', (patch) => {
	expect(() => update(table(), all, patch)).toThrow();
});

test('rejects invalid and empty selections, with empty patches making no changes', () => {
	const source = table();
	expect(() =>
		update(source, { ...all, mode: 'rows', indices: [1.5] }, {})
	).toThrow();
	expect(() =>
		update(source, { ...all, all: false }, { fontSize: '20px' })
	).toThrow();
	expect(update(source, all, {})).toEqual({});
	expect(fieldValue({ styleTokens: { fontSize: '18px' } }, 'fontSize')).toBe(
		'18px'
	);
});

describe('drafts retained across exclusive selection scopes', () => {
	const rows: BulkSelection = { mode: 'rows', all: false, indices: [0, 2] };
	const columns: BulkSelection = {
		mode: 'columns',
		all: false,
		indices: [1],
	};
	test('row and column headers switch exclusively, keeping non-contiguous choices in the same mode', () => {
		const row = selectBulkAxis(all, 'rows', 0);
		expect(row).toEqual({ mode: 'rows', all: false, indices: [0] });
		expect(selectBulkAxis(row, 'rows', 2)).toEqual(rows);
		expect(selectBulkAxis(rows, 'columns', 1)).toEqual(columns);
		expect(selectBulkAxis(columns, 'columns', 1).indices).toEqual([]);
	});
	test('retains row edits, merges overlapping column edits by field, and applies every draft at once', () => {
		const source = table();
		const original = JSON.stringify(source);
		const first = stageBulkPatch(source, emptyBulkDraft(), rows, {
			fontSize: '18px',
			cellBackgroundColor: '#ffeeaa',
		});
		const draft = stageBulkPatch(source, first, columns, {
			fontSize: '24px',
		});
		expect(draftAffectedCells(source, draft)).toHaveLength(9);
		const projected = projectBulkDraft(source, draft);
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'fontSize'
			)
		).toBe('18px');
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[1].attributes,
				'fontSize'
			)
		).toBe('24px');
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 1
				)[0].attributes,
				'fontSize'
			)
		).toBeUndefined();
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[1].attributes,
				'cellBackgroundColor'
			)
		).toBe('#ffeeaa');
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		expect(Object.keys(updates)).toHaveLength(9);
		expect(updates.table).toBeUndefined();
		expect(JSON.stringify(source)).toBe(original);
	});
	test('leave unchanged removes only fields in the current selection, keeping other drafts', () => {
		const source = table();
		let draft = stageBulkPatch(source, emptyBulkDraft(), rows, {
			fontSize: '18px',
			lineHeight: '1.8',
		});
		draft = stageBulkPatch(source, draft, columns, {
			letterSpacing: '0.2em',
		});
		draft = clearBulkFields(source, draft, { ...rows, indices: [0] }, [
			'fontSize',
		]);
		const projected = projectBulkDraft(source, draft);
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'fontSize'
			)
		).toBeUndefined();
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'lineHeight'
			)
		).toBe('1.8');
		expect(
			fieldValue(
				projected.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 2
				)[0].attributes,
				'fontSize'
			)
		).toBe('18px');
		expect(
			draft.edits.some(
				(edit) =>
					edit.field === 'letterSpacing' && edit.value === '0.2em'
			)
		).toBe(true);
	});
	test('inheritance resets remain explicit, including padding zero, and identical values are not queued', () => {
		const source = table();
		const draft = stageBulkPatch(source, emptyBulkDraft(), rows, {
			'padding.top': undefined,
			'padding.left': '7px',
		});
		expect(
			Object.values(draftCellPatches(draft)).every(
				(patch) =>
					Object.prototype.hasOwnProperty.call(
						patch,
						'padding.top'
					) &&
					!Object.prototype.hasOwnProperty.call(patch, 'padding.left')
			)
		).toBe(true);
		expect(
			fieldValue(
				projectBulkDraft(source, draft).innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'padding.bottom'
			)
		).toBe('0');
		expect(
			stageBulkPatch(source, emptyBulkDraft(), all, {
				'padding.top': '0',
			}).edits[0]
		).toMatchObject({ field: 'padding.top', value: '0', global: true });
	});
	test('cancelling uses the original tree and empty drafts produce no updates', () => {
		const source = table();
		expect(
			planBulkDraft(source, structureSignature(source), emptyBulkDraft())
		).toEqual({});
		const draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			fontSize: '24px',
		});
		expect(
			projectBulkDraft(source, draft).innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks
		).toBe(
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks
		);
		expect(
			fieldValue(
				source.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes,
				'fontSize'
			)
		).toBeUndefined();
	});
	test('stale structure and invalid targets reject the whole draft', () => {
		const source = table();
		const draft = stageBulkPatch(source, emptyBulkDraft(), rows, {
			fontSize: '18px',
		});
		expect(() =>
			planBulkDraft(
				{ ...source, innerBlocks: [...source.innerBlocks].reverse() },
				structureSignature(source),
				draft
			)
		).toThrow('stale-structure');
		expect(() =>
			planBulkDraft(source, structureSignature(source), {
				...draft,
				edits: [
					{
						field: 'fontSize',
						value: '18px',
						targets: ['missing'],
						global: false,
					},
				],
			})
		).toThrow('invalid-selection');
		expect(() =>
			stageBulkPatch(source, draft, rows, { fontSize: '-1px' })
		).toThrow('invalid-value');
	});
	test('latest untouched attributes and nested content are preserved when all drafts are applied', () => {
		const source = table();
		const draft = stageBulkPatch(source, emptyBulkDraft(), rows, {
			fontSize: '18px',
		});
		const first = source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		first.attributes.style = {
			typography: { textAlign: 'center' },
			color: { text: '#eeffaa' },
		};
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		expect(updates[first.clientId].style).toEqual({
			typography: { textAlign: 'center', fontSize: '18px' },
			color: { text: '#eeffaa' },
		});
	});
});

describe('table defaults and cell overrides', () => {
	const row: BulkSelection = { mode: 'rows', indices: [0], all: false };
	test('whole-table writes promote only edited properties, preserve native styles and remove all matching cell overrides', () => {
		const source = table();
		source.attributes.style = {
			color: { background: '#112233' },
			typography: { fontFamily: 'serif' },
			spacing: { margin: { top: '12px' } },
		};
		source.innerBlocks[0].attributes.fontSize = 'large';
		const before = JSON.stringify(source);
		const draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			'borderColor.top': '#f00',
			fontSize: '20px',
			verticalAlign: 'middle',
		});
		const projected = projectBulkDraft(source, draft);
		expect(projected.attributes).toMatchObject({
			verticalAlign: 'middle',
			style: {
				color: { background: '#112233' },
				typography: { fontSize: '20px', fontFamily: 'serif' },
				spacing: { margin: { top: '12px' } },
			},
		});
		expect(fieldValue(projected.attributes, 'borderColor.top')).toBe(
			'#f00'
		);
		for (const cell of projected.innerBlocks) {
			expect(cell.attributes.fontSize).toBeUndefined();
			expect(cell.attributes.verticalAlign).toBeUndefined();
			expect(fieldValue(cell.attributes, 'fontSize')).toBeUndefined();
			expect(
				fieldValue(cell.attributes, 'borderColor.top')
			).toBeUndefined();
			expect(fieldValue(cell.attributes, 'borderColor.right')).toBe(
				fieldValue(
					source.innerBlocks.find(
						(item) => item.clientId === cell.clientId
					)!.attributes,
					'borderColor.right'
				)
			);
			expect(
				resolvedFieldValue(projected, cell.attributes, 'fontSize')
			).toBe('20px');
			expect(
				resolvedFieldValue(projected, cell.attributes, 'verticalAlign')
			).toBe('middle');
		}
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		expect(updates[source.clientId]).toBeDefined();
		expect(projected.innerBlocks[0].innerBlocks).toBe(
			source.innerBlocks[0].innerBlocks
		);
		expect(JSON.stringify(source)).toBe(before);
	});
	test('whole-table scopes use logical coverage rather than the number of intersecting merged cells', () => {
		const source = planOperation(table(), {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: 2,
			right: 3,
		}).changes!;
		expect(
			selectsWholeTable(source, {
				mode: 'columns',
				all: false,
				indices: [0],
			})
		).toBe(false);
		const regular = table();
		expect(
			selectsWholeTable(regular, {
				mode: 'rows',
				all: false,
				indices: [2, 0, 1],
			})
		).toBe(true);
		expect(
			selectsWholeTable(regular, {
				mode: 'columns',
				all: false,
				indices: [3, 2, 1, 0],
			})
		).toBe(true);
		const draft = stageBulkPatch(
			regular,
			emptyBulkDraft(),
			{ mode: 'rows', all: false, indices: [0, 1, 2] },
			{ cellBackgroundColor: '#f00' }
		);
		expect(
			projectBulkDraft(regular, draft).attributes.styleTokens
		).toMatchObject({ cellBackgroundColor: '#f00' });
	});
	test('same values on every cell still promote; full resets clear both table and cell settings', () => {
		const source = table();
		const promoted = stageBulkPatch(source, emptyBulkDraft(), all, {
			'padding.top': '0',
		});
		expect(promoted.edits[0].global).toBe(true);
		const next = projectBulkDraft(source, promoted);
		expect(fieldValue(next.attributes, 'padding.top')).toBe('0');
		for (const cell of next.innerBlocks) {
			expect(fieldValue(cell.attributes, 'padding.top')).toBeUndefined();
		}
		const cleared = projectBulkDraft(
			next,
			stageBulkPatch(next, emptyBulkDraft(), all, {
				'padding.top': undefined,
			})
		);
		expect(fieldValue(cleared.attributes, 'padding.top')).toBeUndefined();
		for (const cell of cleared.innerBlocks) {
			expect(fieldValue(cell.attributes, 'padding.top')).toBeUndefined();
		}
	});
	test('edits preserve input order: whole then row makes overrides, row then whole clears them', () => {
		const source = table();
		let draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			fontSize: '20px',
			'padding.top': '12px',
		});
		draft = stageBulkPatch(source, draft, row, { fontSize: '18px' });
		const next = projectBulkDraft(source, draft);
		expect(fieldValue(next.attributes, 'fontSize')).toBe('20px');
		for (const cell of next.innerBlocks) {
			expect(resolvedFieldValue(next, cell.attributes, 'fontSize')).toBe(
				cell.attributes.row === 0 ? '18px' : '20px'
			);
		}
		draft = stageBulkPatch(source, draft, all, { fontSize: '24px' });
		const last = projectBulkDraft(source, draft);
		expect(fieldValue(last.attributes, 'fontSize')).toBe('24px');
		for (const cell of last.innerBlocks) {
			expect(fieldValue(cell.attributes, 'fontSize')).toBeUndefined();
		}
		expect(fieldValue(last.attributes, 'padding.top')).toBe('12px');
	});
	test('clearing part of a whole-table edit preserves excluded cells by making the remainder cell-only', () => {
		const source = table();
		let draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			fontSize: '20px',
		});
		draft = clearBulkFields(source, draft, row, ['fontSize']);
		const next = projectBulkDraft(source, draft);
		expect(fieldValue(next.attributes, 'fontSize')).toBeUndefined();
		for (const cell of next.innerBlocks) {
			expect(fieldValue(cell.attributes, 'fontSize')).toBe(
				cell.attributes.row === 0 ? undefined : '20px'
			);
		}
	});
	test('column selections apply table defaults without overwriting column metadata', () => {
		const source = table();
		const selection: BulkSelection = {
			mode: 'columns',
			all: false,
			indices: [0, 1, 2, 3],
		};
		const draft = stageBulkPatch(source, emptyBulkDraft(), selection, {
			'padding.left': '10px',
		});
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		expect(updates.table).toMatchObject({
			styleTokens: { borderWidth: '1px', cellPaddingLeft: '10px' },
		});
		expect(updates.table).not.toHaveProperty('columns');
	});
	test('inserted cells copy source overrides while unspecified styles inherit table defaults without row metadata', () => {
		const source = table();
		const global = projectBulkDraft(
			source,
			stageBulkPatch(source, emptyBulkDraft(), all, {
				cellBackgroundColor: '#f00',
			})
		);
		const local = projectBulkDraft(
			global,
			stageBulkPatch(global, emptyBulkDraft(), row, {
				cellBackgroundColor: '#0f0',
			})
		);
		expect(local.attributes).not.toHaveProperty('rowStyles');
		const inserted = planOperation(local, {
			type: 'insertColumn',
			index: 1,
		}).changes!;
		const added = inserted.innerBlocks.find(
			(cell) => cell.attributes.row === 0 && cell.attributes.column === 1
		)!;
		expect(fieldValue(added.attributes, 'cellBackgroundColor')).toBe(
			'#0f0'
		);
		expect(
			resolvedFieldValue(
				inserted,
				added.attributes,
				'cellBackgroundColor'
			)
		).toBe('#0f0');
		const inherited = inserted.innerBlocks.find(
			(cell) => cell.attributes.row === 1 && cell.attributes.column === 1
		)!;
		expect(
			fieldValue(inherited.attributes, 'cellBackgroundColor')
		).toBeUndefined();
		expect(
			resolvedFieldValue(
				inserted,
				inherited.attributes,
				'cellBackgroundColor'
			)
		).toBe('#f00');
	});
});

describe('edited-field normalization on apply', () => {
	const row: BulkSelection = { mode: 'rows', indices: [0], all: false };
	const commit = (source: BlockTree, patch: BulkPatch) => {
		const draft = stageBulkPatch(source, emptyBulkDraft(), row, patch);
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		return {
			updates,
			table: {
				...source,
				attributes: {
					...source.attributes,
					...updates[source.clientId],
				},
				innerBlocks: source.innerBlocks.map((cell) => ({
					...cell,
					attributes: {
						...cell.attributes,
						...updates[cell.clientId],
					},
				})),
			},
		};
	};
	test('a final row matching all other cells promotes only edited fields without mutating the source', () => {
		const source = table();
		for (const cell of source.innerBlocks) {
			cell.attributes.style = {
				typography: {
					fontSize: cell.attributes.row === 0 ? '18px' : '20px',
				},
			};
		}
		const before = JSON.stringify(source);
		const draft = stageBulkPatch(source, emptyBulkDraft(), row, {
			fontSize: '20px',
		});
		// Displaying the draft does not run storage normalization.
		expect(
			fieldValue(projectBulkDraft(source, draft).attributes, 'fontSize')
		).toBeUndefined();
		const next = commit(source, { fontSize: '20px' }).table;
		expect(fieldValue(next.attributes, 'fontSize')).toBe('20px');
		for (let i = 0; i < next.innerBlocks.length; i++) {
			expect(
				fieldValue(next.innerBlocks[i].attributes, 'fontSize')
			).toBeUndefined();
			expect(next.innerBlocks[i].attributes.styleTokens).toEqual(
				source.innerBlocks[i].attributes.styleTokens
			);
			expect(next.innerBlocks[i].innerBlocks).toBe(
				source.innerBlocks[i].innerBlocks
			);
		}
		expect(JSON.stringify(source)).toBe(before);
	});
	test('inherited table values participate and redundant overrides are removed', () => {
		const source = table();
		source.attributes.style = {
			typography: { fontSize: '20px', fontFamily: 'serif' },
		};
		for (const cell of source.innerBlocks.filter(
			(item) => item.attributes.row === 0
		)) {
			cell.attributes.fontSize = 'large';
		}
		const next = commit(source, { fontSize: '20px' }).table;
		expect(next.attributes.style).toMatchObject({
			typography: { fontSize: '20px', fontFamily: 'serif' },
		});
		for (const cell of next.innerBlocks) {
			expect(fieldValue(cell.attributes, 'fontSize')).toBeUndefined();
			expect(cell.attributes.fontSize).toBeUndefined();
		}
	});
	test('mixed fields prefer existing parent inheritance and retain only differing overrides', () => {
		const source = table();
		const preset = 'var(--wp--preset--font-size--large)';
		source.attributes.fontSize = 'large';
		source.attributes.style = {
			typography: {
				lineHeight: '2',
				textAlign: 'center',
				fontFamily: 'serif',
			},
		};
		source.attributes.verticalAlign = 'middle';
		source.attributes.styleTokens = {
			borderWidth: '1px',
			borderStyle: 'dashed',
			cellPaddingBlock: '0',
			cellBackgroundColor: '#aabbcc',
		};
		for (const cell of source.innerBlocks.slice(0, 4)) {
			cell.attributes.styleTokens = {
				...(cell.attributes.styleTokens as object),
				cellPaddingBlock: '5px',
				borderStyle: 'solid',
			};
		}
		const matching = source.innerBlocks[4];
		matching.attributes.fontSize = 'large';
		matching.attributes.verticalAlign = 'middle';
		matching.attributes.style = {
			typography: { lineHeight: '2', textAlign: 'center' },
			color: { text: '#aabbcc' },
		};
		matching.attributes.styleTokens = {
			...(matching.attributes.styleTokens as object),
			fontSize: '18px',
			lineHeight: '1.5',
			cellBackgroundColor: '#aabbcc',
			borderWidth: '1px',
		};
		const different = source.innerBlocks[8];
		different.attributes.verticalAlign = 'bottom';
		different.attributes.style = {
			typography: {
				fontSize: '18px',
				lineHeight: '1.5',
				textAlign: 'left',
			},
		};
		different.attributes.styleTokens = {
			...(different.attributes.styleTokens as object),
			cellBackgroundColor: '#112233',
			cellPaddingBlock: '7px',
			borderWidth: '2px',
			borderStyle: 'solid',
		};
		const patch: BulkPatch = {
			fontSize: preset,
			lineHeight: '2',
			textAlign: 'center',
			verticalAlign: 'middle',
			cellBackgroundColor: '#aabbcc',
			'padding.top': '0',
			'borderWidth.left': '1px',
			'borderStyle.bottom': 'dashed',
		};
		const before = JSON.stringify(source);
		const { updates, table: next } = commit(source, patch);
		expect(updates[source.clientId]).toBeUndefined();
		expect(next.attributes).toEqual(source.attributes);
		for (const index of [0, 1, 2, 3, 4]) {
			const attrs = next.innerBlocks[index].attributes;
			for (const field of Object.keys(patch) as (keyof BulkPatch)[]) {
				expect(
					field === 'verticalAlign'
						? attrs.verticalAlign
						: fieldValue(attrs, field)
				).toBeUndefined();
				expect(resolvedFieldValue(next, attrs, field)).toBe(
					patch[field]
				);
			}
			expect(fieldValue(attrs, 'padding.bottom')).toBe(
				index === 4 ? '0' : '5px'
			);
			expect(fieldValue(attrs, 'padding.left')).toBe('7px');
			expect(fieldValue(attrs, 'borderWidth.right')).toBe(
				index === 4 ? '1px' : undefined
			);
			expect(fieldValue(attrs, 'borderStyle.top')).toBe(
				index === 4 ? 'dashed' : 'solid'
			);
			expect(fieldValue(attrs, 'borderColor.top')).toBe(
				fieldValue(
					source.innerBlocks[index].attributes,
					'borderColor.top'
				)
			);
			expect(next.innerBlocks[index].innerBlocks).toBe(
				source.innerBlocks[index].innerBlocks
			);
		}
		expect(next.innerBlocks[4].attributes.styleTokens).not.toHaveProperty(
			'fontSize'
		);
		expect(next.innerBlocks[4].attributes.styleTokens).not.toHaveProperty(
			'lineHeight'
		);
		expect(next.innerBlocks[8].attributes).toEqual(different.attributes);
		expect(JSON.stringify(source)).toBe(before);
	});
	test('mixed values use the parent at confirmation time rather than the draft opening value', () => {
		const source = table();
		source.attributes.style = { typography: { fontSize: '14px' } };
		source.innerBlocks[8].attributes.style = {
			typography: { fontSize: '18px' },
		};
		const draft = stageBulkPatch(source, emptyBulkDraft(), row, {
			fontSize: '20px',
		});
		const latest = {
			...source,
			attributes: {
				...source.attributes,
				style: {
					typography: { fontSize: '20px', fontFamily: 'serif' },
				},
			},
		};
		const updates = planBulkDraft(
			latest,
			structureSignature(source),
			draft
		);
		expect(updates[source.clientId]).toBeUndefined();
		for (const cell of source.innerBlocks.slice(0, 4)) {
			expect(
				fieldValue(
					{ ...cell.attributes, ...updates[cell.clientId] },
					'fontSize'
				)
			).toBeUndefined();
		}
		expect(updates[source.innerBlocks[8].clientId]).toBeUndefined();
	});
	test('a matching partial edit inherits the new global draft value while other partial overrides remain', () => {
		const source = table();
		source.attributes.style = { typography: { fontSize: '14px' } };
		let draft = stageBulkPatch(source, emptyBulkDraft(), all, {
			fontSize: '20px',
		});
		draft = stageBulkPatch(source, draft, row, { fontSize: '18px' });
		draft = stageBulkPatch(
			source,
			draft,
			{ mode: 'columns', indices: [0], all: false },
			{ fontSize: '20px' }
		);
		const updates = planBulkDraft(
			source,
			structureSignature(source),
			draft
		);
		expect(
			fieldValue(
				{ ...source.attributes, ...updates[source.clientId] },
				'fontSize'
			)
		).toBe('20px');
		for (const cell of source.innerBlocks) {
			const local = fieldValue(
				{ ...cell.attributes, ...updates[cell.clientId] },
				'fontSize'
			);
			expect(local).toBe(
				cell.attributes.row === 0 && cell.attributes.column !== 0
					? '18px'
					: undefined
			);
		}
	});
	test('mixed values keep the original table default and other cells untouched', () => {
		const source = table();
		source.attributes.style = { typography: { fontSize: '14px' } };
		const next = commit(source, { fontSize: '20px' }).table;
		expect(fieldValue(next.attributes, 'fontSize')).toBe('14px');
		for (const cell of next.innerBlocks) {
			expect(resolvedFieldValue(next, cell.attributes, 'fontSize')).toBe(
				cell.attributes.row === 0 ? '20px' : '14px'
			);
		}
	});
	test('matching rendered units and preset references are not treated as equal stored values', () => {
		const source = table();
		for (const cell of source.innerBlocks) {
			cell.attributes.style = { typography: { fontSize: '1em' } };
			cell.attributes.styleTokens = {
				cellBackgroundColor: 'var(--wp--preset--color--contrast)',
			};
		}
		const next = commit(source, {
			fontSize: '16px',
			cellBackgroundColor: '#000000',
		}).table;
		expect(fieldValue(next.attributes, 'fontSize')).toBeUndefined();
		expect(
			fieldValue(next.attributes, 'cellBackgroundColor')
		).toBeUndefined();
	});
	test('normalization does not persist the CSS fallback for inherited vertical alignment', () => {
		const source = table();
		for (const cell of source.innerBlocks.filter(
			(item) => item.attributes.row === 0
		)) {
			cell.attributes.verticalAlign = 'bottom';
		}
		const next = commit(source, { verticalAlign: undefined }).table;
		expect(next.attributes.verticalAlign).toBeUndefined();
		for (const cell of next.innerBlocks) {
			expect(cell.attributes.verticalAlign).toBeUndefined();
		}
	});
	test('normalization reads the latest untouched attributes at apply time', () => {
		const source = table();
		const draft = stageBulkPatch(source, emptyBulkDraft(), row, {
			lineHeight: '2',
		});
		const latest = {
			...source,
			attributes: {
				...source.attributes,
				style: { typography: { lineHeight: '2' } },
			},
		};
		const updates = planBulkDraft(
			latest,
			structureSignature(source),
			draft
		);
		expect(updates[source.clientId]).toBeUndefined();
		for (const cell of source.innerBlocks.filter(
			(item) => item.attributes.row === 0
		)) {
			expect(
				fieldValue(
					{ ...cell.attributes, ...updates[cell.clientId] },
					'lineHeight'
				)
			).toBeUndefined();
		}
	});
});
