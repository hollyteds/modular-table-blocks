import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree, TableOperation } from '../../src/grid/operations';
import { columnTemplate, validColumnWidth } from '../../src/styles/columns';

const paragraph = (id: string, text = ''): BlockTree => ({
	clientId: id,
	name: 'core/paragraph',
	attributes: { content: text },
	innerBlocks: [],
});
const cell = (id: string, text = ''): BlockTree => ({
	clientId: id,
	name: 'modular-table-blocks/cell',
	attributes: {
		tag: 'td',
		colSpan: 1,
		rowSpan: 1,
		styleTokens: { textColor: '#123456' },
	},
	innerBlocks: [paragraph(`${id}-text`, text)],
});
const row = (id: string, text = ''): BlockTree => ({
	clientId: id,
	name: 'modular-table-blocks/row',
	attributes: { section: 'body' },
	innerBlocks: [cell(`${id}-a`, text), cell(`${id}-b`)],
});
const table = (): BlockTree => ({
	clientId: 'table',
	name: 'modular-table-blocks/table',
	attributes: {
		caption: 'Caption',
		headerRows: 1,
		columns: [{ width: '40%' }, { width: '60%' }],
	},
	innerBlocks: [row('first', 'Keep me'), row('second')],
});

function apply(source: BlockTree, operation: TableOperation): BlockTree {
	const plan = planOperation(source, operation);
	expect(plan.errors).toEqual([]);
	expect(plan.changes).not.toBeNull();
	return plan.changes!;
}

function freeze(block: BlockTree): void {
	block.innerBlocks.forEach(freeze);
	Object.freeze(block.attributes);
	Object.freeze(block.innerBlocks);
	Object.freeze(block);
}

describe('M1 immutable structure plans', () => {
	it('accepts empty columns reserialized by WordPress without changing source data', () => {
		const source = table();
		const emptyColumn = Object.freeze([]);
		source.attributes.columns = [emptyColumn, { width: '60%' }];
		freeze(source);
		expect(structureErrors(source)).toEqual([]);
		const next = apply(source, { type: 'insertColumn', index: 1 });
		expect(next.attributes.columns).toEqual([{}, {}, { width: '60%' }]);
		expect(source.attributes.columns).toEqual([[], { width: '60%' }]);
		expect((source.attributes.columns as unknown[])[0]).toBe(emptyColumn);
		expect(next.innerBlocks[0].innerBlocks[0]).toBe(
			source.innerBlocks[0].innerBlocks[0]
		);
	});
	it.each([null, 'bad', 1, ['bad'], [{}], [[], []]])(
		'rejects malformed column settings %j',
		(column) => {
			const source = table();
			source.attributes.columns = [column, { width: '60%' }];
			expect(structureErrors(source)).toEqual(['invalid-grid']);
			expect(
				planOperation(source, { type: 'insertRow', index: 0 }).changes
			).toBeNull();
		}
	);
	it('recognizes empty Gutenberg rich-text values without discarding formatted content', () => {
		const source = table();
		const blank = Object.freeze({ toString: () => '' });
		source.innerBlocks[1].innerBlocks.forEach((c) => {
			c.innerBlocks[0].attributes = { content: blank, dropCap: false };
		});
		expect(
			planOperation(source, { type: 'deleteRow', index: 1 }).warnings
		).toEqual([]);
		const formatted = Object.freeze({
			toString: () => '<strong>Keep</strong>',
		});
		source.innerBlocks[1].innerBlocks[0].innerBlocks[0].attributes.content =
			formatted;
		expect(
			planOperation(source, { type: 'deleteRow', index: 1 }).warnings
		).toEqual(['delete-content']);
		const clone = apply(source, { type: 'duplicateRow', index: 1 })
			.innerBlocks[2];
		expect(clone.innerBlocks[0].innerBlocks[0].attributes.content).toBe(
			formatted
		);
	});
	it('inserts rows at both boundaries and preserves existing blocks', () => {
		for (const index of [0, 2]) {
			const source = table();
			const next = apply(source, { type: 'insertRow', index });
			expect(next.innerBlocks).toHaveLength(3);
			expect(next.innerBlocks[index].innerBlocks).toHaveLength(2);
			expect(next.innerBlocks.find((r) => r.clientId === 'first')).toBe(
				source.innerBlocks[0]
			);
			expect(next.attributes.columns).toEqual(source.attributes.columns);
		}
	});
	it('requires confirmation only for rows/columns containing content', () => {
		for (const type of ['deleteRow', 'deleteColumn'] as const) {
			expect(planOperation(table(), { type, index: 0 }).warnings).toEqual(
				['delete-content']
			);
			expect(planOperation(table(), { type, index: 1 }).warnings).toEqual(
				[]
			);
		}
	});
	it('duplicates all nested content and styles with fresh identity placeholders', () => {
		const source = table();
		source.innerBlocks[0].innerBlocks[0].innerBlocks.push({
			clientId: 'list',
			name: 'core/list',
			attributes: {},
			innerBlocks: [
				{
					clientId: 'item',
					name: 'core/list-item',
					attributes: { content: 'Nested item' },
					innerBlocks: [],
				},
			],
		});
		const next = apply(source, { type: 'duplicateRow', index: 0 });
		expect(next.innerBlocks[0]).toBe(source.innerBlocks[0]);
		const duplicate = next.innerBlocks[1];
		expect(duplicate.clientId).toBe('');
		expect(
			duplicate.innerBlocks[0].innerBlocks[1].innerBlocks[0].clientId
		).toBe('');
		expect(
			duplicate.innerBlocks[0].innerBlocks[1].innerBlocks[0].attributes
				.content
		).toBe('Nested item');
		expect(duplicate.innerBlocks[0].attributes).toEqual(
			source.innerBlocks[0].innerBlocks[0].attributes
		);
	});
	it('moves a row without modifying its cells', () => {
		const source = table();
		const next = apply(source, {
			type: 'moveRow',
			index: 0,
			destination: 1,
		});
		expect(next.innerBlocks).toEqual([
			source.innerBlocks[1],
			source.innerBlocks[0],
		]);
		expect(next.innerBlocks[1]).toBe(source.innerBlocks[0]);
	});
	it.each([0, 1, 2])(
		'inserts column %i consistently in all rows',
		(index) => {
			const source = table();
			const next = apply(source, { type: 'insertColumn', index });
			expect(next.attributes.columns).toHaveLength(3);
			for (let r = 0; r < 2; r++) {
				expect(next.innerBlocks[r].innerBlocks).toHaveLength(3);
				expect(
					next.innerBlocks[r].innerBlocks.filter(
						(c) => c.clientId !== ''
					)
				).toEqual(source.innerBlocks[r].innerBlocks);
			}
			expect(structureErrors(next)).toEqual([]);
		}
	);
	it('deletes a column while retaining the other column settings and nested content', () => {
		const source = table();
		const next = apply(source, { type: 'deleteColumn', index: 1 });
		expect(next.attributes.columns).toEqual([{ width: '40%' }]);
		expect(next.innerBlocks[0].innerBlocks[0]).toBe(
			source.innerBlocks[0].innerBlocks[0]
		);
		expect(
			next.innerBlocks[0].innerBlocks[0].innerBlocks[0].attributes.content
		).toBe('Keep me');
	});
	it('rejects removal of the last row/column', () => {
		const source = apply(apply(table(), { type: 'deleteRow', index: 1 }), {
			type: 'deleteColumn',
			index: 1,
		});
		expect(
			planOperation(source, { type: 'deleteRow', index: 0 }).errors
		).toEqual(['last-row']);
		expect(
			planOperation(source, { type: 'deleteColumn', index: 0 }).errors
		).toEqual(['last-column']);
	});
	it.each([-1, 0.5, NaN, Infinity, 9])(
		'rejects invalid index %s without a change plan',
		(index) => {
			const plan = planOperation(table(), {
				type: 'deleteColumn',
				index,
			});
			expect(plan.changes).toBeNull();
			expect(plan.errors).toEqual(['invalid-index']);
		}
	);
	it('rejects invalid row movement', () => {
		expect(
			planOperation(table(), {
				type: 'moveRow',
				index: 0,
				destination: 0,
			}).errors
		).toEqual(['invalid-index']);
		expect(
			planOperation(table(), {
				type: 'moveRow',
				index: 0,
				destination: 3,
			}).errors
		).toEqual(['invalid-index']);
	});
	it('updates valid merged grids in M2', () => {
		const source = table();
		source.innerBlocks[0].innerBlocks = [cell('merged')];
		source.innerBlocks[0].innerBlocks[0].attributes.colSpan = 2;
		expect(
			planOperation(source, { type: 'insertColumn', index: 1 }).errors
		).toEqual([]);
		source.innerBlocks[0].innerBlocks = [cell('vertical'), cell('right')];
		source.innerBlocks[0].innerBlocks[0].attributes.rowSpan = 2;
		source.innerBlocks[1].innerBlocks.splice(0, 1);
		source.attributes.headerRows = 0;
		expect(
			planOperation(source, { type: 'deleteRow', index: 0 }).errors
		).toEqual([]);
	});
	it('does not silently normalize invalid or mixed-section data', () => {
		const source = table();
		source.innerBlocks[0].innerBlocks.pop();
		expect(structureErrors(source)).toEqual(['invalid-grid']);
		const sectioned = table();
		sectioned.innerBlocks[0].attributes.section = 'head';
		expect(structureErrors(sectioned)).toEqual(['section-boundary']);
	});
	it('never mutates frozen input or shares duplicate attribute objects', () => {
		const source = table();
		const before = JSON.stringify(source);
		freeze(source);
		for (const operation of [
			{ type: 'insertRow', index: 1 },
			{ type: 'deleteRow', index: 0 },
			{ type: 'duplicateRow', index: 0 },
			{ type: 'moveRow', index: 1, destination: 0 },
			{ type: 'insertColumn', index: 0 },
			{ type: 'deleteColumn', index: 1 },
		] as TableOperation[]) {
			expect(() => apply(source, operation)).not.toThrow();
		}
		expect(JSON.stringify(source)).toBe(before);
	});
	it('initializes only an empty table with bounded dimensions', () => {
		const empty = { ...table(), innerBlocks: [] };
		expect(
			apply(empty, { type: 'initialize', rows: 3, columns: 3 })
				.innerBlocks
		).toHaveLength(3);
		for (const rows of [0, 21, 1.5]) {
			expect(
				planOperation(empty, { type: 'initialize', rows, columns: 3 })
					.changes
			).toBeNull();
		}
		expect(
			planOperation(table(), { type: 'initialize', rows: 3, columns: 3 })
				.changes
		).toBeNull();
	});
	it('bounds structural growth', () => {
		const source = table();
		source.innerBlocks = Array.from({ length: 100 }, (_, i) =>
			row(`r${i}`)
		);
		expect(
			planOperation(source, { type: 'insertRow', index: 100 }).errors
		).toEqual(['size-limit']);
	});
});

it('validates column widths before constructing editor grid styles', () => {
	expect(columnTemplate([{ width: '40%' }, { width: '60%' }])).toBe(
		'minmax(8rem, 40%) minmax(8rem, 60%)'
	);
	expect(columnTemplate([{ width: 'red;position:fixed' }, {}])).toBe(
		'minmax(8rem, 1fr) minmax(8rem, 1fr)'
	);
	expect(validColumnWidth('-1px')).toBe(false);
	expect(validColumnWidth('101%')).toBe(false);
});
