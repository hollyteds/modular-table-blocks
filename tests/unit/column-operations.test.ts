import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree, TableOperation } from '../../src/grid/operations';
import { placements } from '../../src/grid/layout';

function table(height = 3, width = 3): BlockTree {
	return {
		clientId: 'table',
		name: 'modular-table-blocks/table',
		attributes: {
			rowCount: height,
			columns: Array.from({ length: width }, (_, c) => ({
				width: `${100 + c}px`,
			})),
			headerRows: 1,
			styleTokens: { borderColor: '#123456' },
		},
		innerBlocks: Array.from({ length: height * width }, (_, i) => ({
			clientId: `cell-${i}`,
			name: 'modular-table-blocks/cell',
			attributes: {
				row: Math.floor(i / width),
				column: i % width,
				tag: Math.floor(i / width) === 0 ? 'th' : 'td',
				scope: Math.floor(i / width) === 0 ? 'col' : '',
				styleTokens: { cellPaddingTop: `${i}px` },
			},
			innerBlocks: [
				{
					clientId: `text-${i}`,
					name: 'core/paragraph',
					attributes: {
						content: `${Math.floor(i / width)},${i % width}`,
					},
					innerBlocks: [],
				},
			],
		})),
	};
}
function apply(source: BlockTree, operation: TableOperation) {
	const before = JSON.stringify(source);
	const plan = planOperation(source, operation);
	expect(plan.errors).toEqual([]);
	expect(plan.warnings).toEqual([]);
	expect(JSON.stringify(source)).toBe(before);
	expect(structureErrors(plan.changes!)).toEqual([]);
	return plan.changes!;
}
const rows = (source: BlockTree) =>
	Array.from({ length: Number(source.attributes.rowCount) }, (_, r) =>
		source.innerBlocks
			.filter((c) => c.attributes.row === r)
			.map((c) => c.innerBlocks[0].attributes.content)
	);
function vertical(source: BlockTree, column: number) {
	const cells = source.innerBlocks.filter(
		(cell) =>
			!(cell.attributes.row === 1 && cell.attributes.column === column)
	);
	return {
		...source,
		innerBlocks: cells.map((cell) =>
			cell.attributes.row === 0 && cell.attributes.column === column
				? { ...cell, attributes: { ...cell.attributes, rowSpan: 2 } }
				: cell
		),
		attributes: { ...source.attributes, headerRows: 0 },
	};
}
function horizontal(source: BlockTree) {
	return {
		...source,
		innerBlocks: source.innerBlocks
			.filter(
				(c) => !(c.attributes.row === 1 && c.attributes.column === 1)
			)
			.map((c) =>
				c.attributes.row === 1 && c.attributes.column === 0
					? { ...c, attributes: { ...c.attributes, colSpan: 2 } }
					: c
			),
	};
}

test.each([
	[
		0,
		2,
		[
			['0,1', '0,2', '0,0'],
			['1,1', '1,2', '1,0'],
			['2,1', '2,2', '2,0'],
		],
		['101px', '102px', '100px'],
	],
	[
		2,
		0,
		[
			['0,2', '0,0', '0,1'],
			['1,2', '1,0', '1,1'],
			['2,2', '2,0', '2,1'],
		],
		['102px', '100px', '101px'],
	],
	[
		1,
		2,
		[
			['0,0', '0,2', '0,1'],
			['1,0', '1,2', '1,1'],
			['2,0', '2,2', '2,1'],
		],
		['100px', '102px', '101px'],
	],
] as const)(
	'moving column %s to %s preserves settings and nested block identity',
	(index, destination, expected, widths) => {
		const source = table();
		const next = apply(source, { type: 'moveColumn', index, destination });
		expect(rows(next)).toEqual(expected);
		expect(
			(next.attributes.columns as { width: string }[]).map((c) => c.width)
		).toEqual(widths);
		expect(next.attributes.headerRows).toBe(1);
		expect(next.attributes.styleTokens).toBe(source.attributes.styleTokens);
		for (const cell of source.innerBlocks) {
			const retained = next.innerBlocks.find(
				(c) => c.clientId === cell.clientId
			)!;
			expect(retained.innerBlocks).toBe(cell.innerBlocks);
			expect(retained.attributes.styleTokens).toBe(
				cell.attributes.styleTokens
			);
			expect(retained.attributes.tag).toBe(cell.attributes.tag);
			expect(retained.attributes.scope).toBe(cell.attributes.scope);
		}
	}
);

test('column duplication inserts a deep block clone on the right and copies its width and cell settings', () => {
	const source = table();
	source.innerBlocks[1].innerBlocks = [
		{
			clientId: 'list',
			name: 'core/list',
			attributes: { ordered: true },
			innerBlocks: [
				{
					clientId: 'item',
					name: 'core/list-item',
					attributes: { content: 'Nested' },
					innerBlocks: [],
				},
			],
		},
	];
	const next = apply(source, { type: 'duplicateColumn', index: 1 });
	expect(next.attributes.columns).toEqual([
		{ width: '100px' },
		{ width: '101px' },
		{ width: '101px' },
		{ width: '102px' },
	]);
	for (let r = 0; r < 3; r++) {
		const old = source.innerBlocks.find(
			(c) => c.attributes.row === r && c.attributes.column === 1
		)!;
		const copy = next.innerBlocks.find(
			(c) => c.attributes.row === r && c.attributes.column === 2
		)!;
		expect(copy.clientId).toBe('');
		expect(copy.attributes).toEqual({
			...old.attributes,
			column: 2,
		});
		expect(copy.innerBlocks).not.toBe(old.innerBlocks);
		const check = (blocks: BlockTree[]) =>
			blocks.forEach((block) => {
				expect(block.clientId).toBe('');
				check(block.innerBlocks);
			});
		check(copy.innerBlocks);
		expect(next.innerBlocks.find((c) => c.clientId === old.clientId)).toBe(
			old
		);
	}
	expect(
		next.innerBlocks[2].innerBlocks[0].innerBlocks[0].attributes.content
	).toBe('Nested');
	expect(next.attributes.rowCount).toBe(3);
});

test('vertical merges can be moved and duplicated as complete columns without copying their content per row', () => {
	for (let column = 0; column < 3; column++) {
		const source = vertical(table(), column);
		for (let destination = 0; destination < 3; destination++) {
			if (column === destination) {
				continue;
			}
			const next = apply(source, {
				type: 'moveColumn',
				index: column,
				destination,
			});
			const anchor = next.innerBlocks.find(
				(c) => c.clientId === source.innerBlocks[column].clientId
			)!;
			expect(anchor.attributes.column).toBe(destination);
			expect(anchor.attributes.rowSpan).toBe(2);
			expect(anchor.innerBlocks).toBe(
				source.innerBlocks[column].innerBlocks
			);
		}
		const next = apply(source, { type: 'duplicateColumn', index: column });
		const copy = placements(next).find(
			(p) => p.row === 0 && p.column === column + 1
		)!;
		expect(copy.height).toBe(2);
		expect(
			next.innerBlocks.filter((c) => c.attributes.column === column + 1)
		).toHaveLength(2);
	}
});

test('horizontal merges reject source or path intersections but leave unrelated columns operable', () => {
	const source = horizontal(table(3, 4));
	const before = JSON.stringify(source);
	for (const index of [0, 1]) {
		expect(
			planOperation(source, { type: 'duplicateColumn', index }).errors
		).toEqual(['ambiguous-column-operation']);
		expect(
			planOperation(source, { type: 'moveColumn', index, destination: 3 })
				.errors
		).toEqual(['ambiguous-column-operation']);
	}
	expect(
		planOperation(source, { type: 'moveColumn', index: 3, destination: 0 })
			.errors
	).toEqual(['ambiguous-column-operation']);
	for (const operation of [
		{ type: 'moveColumn', index: 3, destination: 2 },
		{ type: 'duplicateColumn', index: 3 },
	] as TableOperation[]) {
		const next = apply(source, operation);
		expect(next.innerBlocks.find((c) => c.attributes.colSpan === 2)).toBe(
			source.innerBlocks.find((c) => c.attributes.colSpan === 2)
		);
	}
	expect(JSON.stringify(source)).toBe(before);
});

test('column indexes use the column count in non-square tables and reject malformed destinations and limits', () => {
	const wide = table(1, 4);
	expect(
		rows(apply(wide, { type: 'moveColumn', index: 3, destination: 0 }))
	).toEqual([['0,3', '0,0', '0,1', '0,2']]);
	expect(
		apply(wide, { type: 'duplicateColumn', index: 3 }).innerBlocks
	).toHaveLength(5);
	const narrow = table(4, 1);
	for (const type of ['duplicateColumn', 'moveColumn'] as const) {
		for (const index of [-1, 1, 1.5, NaN, Infinity]) {
			expect(
				planOperation(narrow, { type, index, destination: 0 }).errors
			).toEqual(['invalid-index']);
		}
	}
	for (const destination of [-1, 3, 0.5, NaN, Infinity, 1]) {
		expect(
			planOperation(table(), {
				type: 'moveColumn',
				index: 1,
				destination,
			}).errors
		).toEqual(['invalid-index']);
	}
	expect(
		planOperation(table(1, 50), { type: 'duplicateColumn', index: 0 })
			.errors
	).toEqual(['size-limit']);
	expect(
		planOperation(
			{ ...table(), innerBlocks: [] },
			{ type: 'duplicateColumn', index: 0 }
		).errors
	).toEqual(['invalid-grid']);
});
