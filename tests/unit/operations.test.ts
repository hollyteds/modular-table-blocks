import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree, TableOperation } from '../../src/grid/operations';
import { placements } from '../../src/grid/layout';
import { cellSemantics } from '../../src/grid/cell-type';
import { columnTemplate, validColumnWidth } from '../../src/styles/columns';

function table(rows = 2, columns = 2): BlockTree {
	const source = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows, columns }
	).changes!;
	source.innerBlocks.forEach((cell, i) => {
		cell.clientId = `cell-${i}`;
		cell.innerBlocks = [
			{
				clientId: `text-${i}`,
				name: 'core/paragraph',
				attributes: { content: `Content ${i}` },
				innerBlocks: [],
			},
		];
	});
	return source;
}
function apply(source: BlockTree, operation: TableOperation) {
	const before = JSON.stringify(source);
	const plan = planOperation(source, operation);
	expect(plan.errors).toEqual([]);
	expect(JSON.stringify(source)).toBe(before);
	expect(structureErrors(plan.changes!)).toEqual([]);
	return plan.changes!;
}
const contents = (source: BlockTree) =>
	placements(source).flatMap((p) =>
		p.cell.innerBlocks.map((b) => b.attributes.content)
	);
test.each([1, 2, 3, 20])(
	'initializes flat cells with one blank cell text and explicit coordinates for %s rows',
	(rows) => {
		const next = planOperation(
			{
				clientId: 'table',
				name: 'modular-table-blocks/table',
				attributes: {},
				innerBlocks: [],
			},
			{ type: 'initialize', rows, columns: 3 }
		).changes!;
		expect(next.attributes.rowCount).toBe(rows);
		expect(next.innerBlocks).toHaveLength(rows * 3);
		expect(structureErrors(next)).toEqual([]);
		next.innerBlocks.forEach((cell, i) => {
			expect(cell.name).toBe('modular-table-blocks/cell');
			expect(cell.attributes).toEqual({
				row: Math.floor(i / 3),
				column: i % 3,
			});
			expect(cell.innerBlocks).toEqual([
				{
					clientId: '',
					name: 'modular-table-blocks/cell-text',
					attributes: { content: '' },
					innerBlocks: [],
				},
			]);
		});
	}
);
test.each([0, -1, 21, 1.5, NaN, Infinity])(
	'rejects invalid initialization %s',
	(rows) => {
		expect(
			planOperation(
				{
					clientId: 'table',
					name: 'modular-table-blocks/table',
					attributes: {},
					innerBlocks: [],
				},
				{ type: 'initialize', rows, columns: 2 }
			).errors
		).toEqual(['invalid-dimensions']);
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s adds cells with blank cell text and preserves all content',
	(type) => {
		for (const index of [0, 1, 2]) {
			const source = table();
			const next = apply(source, { type, index });
			expect(contents(next).filter(Boolean).sort()).toEqual(
				contents(source).sort()
			);
			const added = next.innerBlocks.filter((c) => !c.clientId);
			expect(added).toHaveLength(2);
			added.forEach((c) =>
				expect(c.innerBlocks).toEqual([
					{
						clientId: '',
						name: 'modular-table-blocks/cell-text',
						attributes: { content: '' },
						innerBlocks: [],
					},
				])
			);
			for (const cell of source.innerBlocks) {
				expect(
					next.innerBlocks.find((c) => c.clientId === cell.clientId)
						?.innerBlocks
				).toBe(cell.innerBlocks);
			}
		}
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s copies each source cell style and type before and after the selected line without copying identity or content',
	(type) => {
		for (const index of [1, 2]) {
			const source = table(3, 3);
			source.innerBlocks.forEach((cell, i) => {
				Object.assign(cell.attributes, {
					styleTokens: {
						cellBackgroundColor: '#ffeecc',
						cellPaddingTop: `${i}px`,
						borderBottomWidth: '2px',
					},
					style: {
						color: { text: '#123456' },
						typography: {
							fontSize: `${i + 16}px`,
							textAlign: 'right',
						},
					},
					fontSize: 'large',
					fontFamily: 'serif',
					textColor: 'contrast',
					backgroundColor: 'base',
					horizontalAlign: 'center',
					verticalAlign: 'middle',
					tag: 'th',
					scope: 'row',
					lock: { move: true, remove: true },
					metadata: { name: 'Keep identity' },
					anchor: 'unique-anchor',
					className: 'custom-cell',
				});
			});
			const next = apply(source, { type, index, sourceIndex: 1 });
			const added = next.innerBlocks.filter((cell) => !cell.clientId);
			expect(added).toHaveLength(3);
			added.forEach((cell, i) => {
				const origin =
					source.innerBlocks[
						type === 'insertRow' ? 3 + i : i * 3 + 1
					];
				const { row, column, lock, metadata, anchor, ...styles } =
					origin.attributes;
				expect(cell.attributes).toEqual({
					...styles,
					row: type === 'insertRow' ? index : i,
					column: type === 'insertColumn' ? index : i,
				});
				expect(cell.innerBlocks[0].attributes.content).toBe('');
				expect(cell.attributes.style).not.toBe(origin.attributes.style);
				expect(cell.attributes.styleTokens).not.toBe(
					origin.attributes.styleTokens
				);
			});
			const style = added[0].attributes.style as {
				typography: { fontSize: string };
			};
			style.typography.fontSize = '99px';
			expect(
				source.innerBlocks.every(
					(cell) =>
						(cell.attributes.style as typeof style).typography
							.fontSize !== '99px'
				)
			).toBe(true);
		}
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s at the end copies the final line and keeps inherited styles unspecified',
	(type) => {
		const source = table();
		source.innerBlocks[3].attributes.styleTokens = {
			cellPaddingTop: '13px',
		};
		const next = apply(source, { type, index: 2 });
		const added = next.innerBlocks.filter((cell) => !cell.clientId);
		expect(added[0].attributes.styleTokens).toBeUndefined();
		expect(added[0].attributes.style).toBeUndefined();
		expect(added[1].attributes.styleTokens).toEqual({
			cellPaddingTop: '13px',
		});
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s resolves covered source slots without creating merged new cells',
	(type) => {
		let source = table(3, 3);
		source.innerBlocks[0].attributes.styleTokens = {
			cellBackgroundColor: '#123456',
		};
		source = apply(source, {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: type === 'insertColumn' ? 1 : 0,
			right: type === 'insertRow' ? 1 : 0,
		});
		const next = apply(source, { type, index: 0, sourceIndex: 0 });
		const added = next.innerBlocks.filter((cell) => !cell.clientId);
		expect(added).toHaveLength(3);
		for (const cell of added.slice(0, 2)) {
			expect(cell.attributes.styleTokens).toEqual({
				cellBackgroundColor: '#123456',
			});
			expect(cell.attributes.colSpan ?? 1).toBe(1);
			expect(cell.attributes.rowSpan ?? 1).toBe(1);
		}
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s expands intersecting merges and styles only newly created cells',
	(type) => {
		let source = table();
		source.innerBlocks.forEach((cell) => {
			cell.attributes.styleTokens = { cellPaddingTop: '12px' };
		});
		source = apply(source, {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: type === 'insertRow' ? 1 : 0,
			right: type === 'insertColumn' ? 1 : 0,
		});
		const next = apply(source, { type, index: 1, sourceIndex: 0 });
		const added = next.innerBlocks.filter((cell) => !cell.clientId);
		expect(added).toHaveLength(1);
		expect(added[0].attributes.styleTokens).toEqual({
			cellPaddingTop: '12px',
		});
		expect(
			next.innerBlocks.find((cell) => cell.clientId === 'cell-0')!
				.attributes[type === 'insertRow' ? 'rowSpan' : 'colSpan']
		).toBe(3);
	}
);
test.each(['insertRow', 'insertColumn'] as const)(
	'%s keeps mixed TH/TD types and valid header associations for inserts and appends',
	(type) => {
		const source = table(3, 3);
		source.innerBlocks.forEach((cell, i) => {
			cell.attributes.tag = i % 2 ? 'td' : 'th';
			cell.attributes.scope = 'rowgroup';
		});
		for (const [index, sourceIndex] of [
			[1, 1],
			[2, 1],
			[3, 2],
		]) {
			const next = apply(source, { type, index, sourceIndex });
			const added = next.innerBlocks.filter((cell) => !cell.clientId);
			added.forEach((cell, i) => {
				const origin =
					source.innerBlocks[
						type === 'insertRow'
							? sourceIndex * 3 + i
							: i * 3 + sourceIndex
					];
				expect(cell.attributes.tag).toBe(origin.attributes.tag);
				expect(cell.attributes.scope).toBe(
					origin.attributes.tag === 'th' ? 'rowgroup' : undefined
				);
			});
		}
	}
);
test('row insertion copies the effective managed header type and scope while the destination still follows headerRows', () => {
	const source = table();
	source.attributes.headerRows = 1;
	source.innerBlocks.forEach((cell) => {
		cell.attributes.tag = 'td';
		cell.attributes.scope = 'row';
	});
	const below = apply(source, {
		type: 'insertRow',
		index: 1,
		sourceIndex: 0,
	});
	expect(below.attributes.headerRows).toBe(1);
	for (const cell of below.innerBlocks.filter((entry) => !entry.clientId)) {
		expect(cell.attributes).toMatchObject({ tag: 'th', scope: 'col' });
		expect(cellSemantics(below.attributes, cell.attributes)).toEqual({
			tag: 'th',
			isManagedHeader: false,
		});
	}
	const above = apply(source, {
		type: 'insertRow',
		index: 0,
		sourceIndex: 1,
	});
	for (const cell of above.innerBlocks.filter((entry) => !entry.clientId)) {
		expect(cell.attributes.tag).toBe('td');
		expect(cell.attributes.scope).toBeUndefined();
		expect(cellSemantics(above.attributes, cell.attributes)).toEqual({
			tag: 'th',
			isManagedHeader: true,
		});
	}
});
test('column insertion copies managed TH and body TD independently and ignores invalid source types and scopes', () => {
	const source = table();
	source.attributes.headerRows = 1;
	source.innerBlocks[0].attributes.tag = 'td';
	source.innerBlocks[0].attributes.scope = 'row';
	source.innerBlocks[2].attributes.tag = 'invalid';
	source.innerBlocks[2].attributes.scope = 'col';
	const next = apply(source, {
		type: 'insertColumn',
		index: 1,
		sourceIndex: 0,
	});
	const added = next.innerBlocks.filter((cell) => !cell.clientId);
	expect(added[0].attributes).toMatchObject({ tag: 'th', scope: 'col' });
	expect(added[1].attributes.tag).toBe('td');
	expect(added[1].attributes.scope).toBeUndefined();
	source.innerBlocks[2].attributes.tag = 'th';
	source.innerBlocks[2].attributes.scope = 'invalid';
	const invalidScope = apply(source, {
		type: 'insertColumn',
		index: 1,
		sourceIndex: 0,
	});
	const copied = invalidScope.innerBlocks.find(
		(cell) => !cell.clientId && cell.attributes.row === 1
	)!;
	expect(copied.attributes.tag).toBe('th');
	expect(copied.attributes.scope).toBeUndefined();
});
test('column insertion copies only a valid source width and leaves unrelated column metadata on the source', () => {
	const source = table();
	source.attributes.columns = [
		{ width: '180px', identity: 'original' },
		{ width: 'invalid' },
	];
	expect(
		apply(source, { type: 'insertColumn', index: 1, sourceIndex: 0 })
			.attributes.columns
	).toEqual([
		{ width: '180px', identity: 'original' },
		{ width: '180px' },
		{ width: 'invalid' },
	]);
	expect(
		apply(source, { type: 'insertColumn', index: 1, sourceIndex: 1 })
			.attributes.columns
	).toEqual([
		{ width: '180px', identity: 'original' },
		{},
		{ width: 'invalid' },
	]);
});
test.each(['insertRow', 'insertColumn'] as const)(
	'%s rejects an invalid style source',
	(type) => {
		for (const sourceIndex of [-1, 2, 0.5, NaN]) {
			expect(
				planOperation(table(), { type, index: 0, sourceIndex }).errors
			).toEqual(['invalid-index']);
		}
	}
);
test('row duplication clones nested content and retains cell settings', () => {
	const source = table();
	source.innerBlocks[0].attributes.styleTokens = { borderColor: '#123456' };
	const next = apply(source, { type: 'duplicateRow', index: 0 });
	expect(next.attributes.rowCount).toBe(3);
	expect(contents(next)).toEqual([
		'Content 0',
		'Content 1',
		'Content 0',
		'Content 1',
		'Content 2',
		'Content 3',
	]);
	const copy = next.innerBlocks[2];
	expect(copy.clientId).toBe('');
	expect(copy.innerBlocks[0].clientId).toBe('');
	expect(copy.innerBlocks[0].attributes.content).toBe('Content 0');
	expect(copy.attributes.styleTokens).toEqual(
		source.innerBlocks[0].attributes.styleTokens
	);
	expect(next.innerBlocks[0]).toBe(source.innerBlocks[0]);
});
test('moves rows using coordinates without modifying nested blocks', () => {
	const source = table(3);
	const next = apply(source, { type: 'moveRow', index: 0, destination: 2 });
	expect(contents(next)).toEqual([
		'Content 2',
		'Content 3',
		'Content 4',
		'Content 5',
		'Content 0',
		'Content 1',
	]);
	expect(next.innerBlocks[4].innerBlocks).toBe(
		source.innerBlocks[0].innerBlocks
	);
});
test.each(['deleteRow', 'deleteColumn'] as const)(
	'%s warns about content and retains unaffected blocks',
	(type) => {
		const source = table();
		expect(planOperation(source, { type, index: 1 }).warnings).toEqual([
			'delete-content',
		]);
		const next = apply(source, { type, index: 1 });
		expect(next.innerBlocks[0]).toBe(source.innerBlocks[0]);
	}
);
test.each(['', ' ', '0', '<b>Literal</b>'])(
	'detects cell-text content %p for deletion',
	(content) => {
		const source = table();
		source.innerBlocks
			.filter((c) => c.attributes.row === 1)
			.forEach((c) => {
				c.innerBlocks = [
					{
						clientId: 'text',
						name: 'modular-table-blocks/cell-text',
						attributes: { content },
						innerBlocks: [],
					},
				];
			});
		expect(
			planOperation(source, { type: 'deleteRow', index: 1 }).warnings
		).toEqual(content === '' ? [] : ['delete-content']);
	}
);
test.each([
	'insertRow',
	'deleteRow',
	'duplicateRow',
	'insertColumn',
	'deleteColumn',
] as const)('%s rejects invalid indexes', (type) => {
	for (const index of [-1, 99, 1.5, NaN]) {
		expect(planOperation(table(), { type, index }).changes).toBeNull();
	}
});
test('protects last dimensions and limits growth', () => {
	expect(
		planOperation(table(1, 1), { type: 'deleteRow', index: 0 }).errors
	).toEqual(['last-row']);
	expect(
		planOperation(table(1, 1), { type: 'deleteColumn', index: 0 }).errors
	).toEqual(['last-column']);
	const source = table(1, 1);
	source.attributes.rowCount = 100;
	source.innerBlocks[0].attributes.rowSpan = 100;
	expect(
		planOperation(source, { type: 'insertRow', index: 0 }).errors
	).toEqual(['size-limit']);
	source.attributes.rowCount = 1;
	source.attributes.columns = Array.from({ length: 50 }, () => ({}));
	source.innerBlocks[0].attributes.rowSpan = 1;
	source.innerBlocks[0].attributes.colSpan = 50;
	expect(
		planOperation(source, { type: 'insertColumn', index: 0 }).errors
	).toEqual(['size-limit']);
});
test('rejects old row trees, missing coordinates, gaps and overlapping origins', () => {
	const source = table();
	for (const bad of [
		{ ...source, attributes: { columns: [{}, {}] } },
		{
			...source,
			innerBlocks: [
				{
					clientId: 'row',
					name: 'modular-table-blocks/row',
					attributes: {},
					innerBlocks: source.innerBlocks,
				},
			],
		},
		{ ...source, innerBlocks: source.innerBlocks.slice(1) },
		{
			...source,
			innerBlocks: [...source.innerBlocks, source.innerBlocks[0]],
		},
	]) {
		expect(structureErrors(bad)).toEqual(['invalid-grid']);
		expect(
			planOperation(bad, { type: 'insertRow', index: 0 }).changes
		).toBeNull();
	}
});
test('normalizes empty PHP column arrays and rejects malformed columns', () => {
	const source = table();
	source.attributes.columns = [[], []];
	expect(structureErrors(source)).toEqual([]);
	source.attributes.columns = [null, {}];
	expect(structureErrors(source)).toEqual(['invalid-grid']);
});
test('validates automatic and explicit column widths', () => {
	expect(columnTemplate([{}, {}], 'auto')).toContain('auto');
	expect(columnTemplate([{ width: '40%' }, { width: '60%' }])).toContain(
		'40%'
	);
	for (const width of ['-1px', '101%', 'red;position:fixed']) {
		expect(validColumnWidth(width)).toBe(false);
	}
});

test.each([-1, 1.5, 3, NaN, '1'])(
	'rejects malformed headerRows %s without changing the tree',
	(headerRows) => {
		const source = table();
		source.attributes.headerRows = headerRows;
		const before = JSON.stringify(source);
		expect(
			planOperation(source, { type: 'insertRow', index: 1 }).errors
		).toEqual(['invalid-grid']);
		expect(JSON.stringify(source)).toBe(before);
	}
);
