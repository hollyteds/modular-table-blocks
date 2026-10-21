import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree, TableOperation } from '../../src/grid/operations';
import { placements } from '../../src/grid/layout';

function table(height = 3, width = 3): BlockTree {
	return {
		clientId: 'table',
		name: 'modular-table-blocks/table',
		attributes: {
			columns: Array.from({ length: width }, () => ({})),
			headerRows: 0,
		},
		innerBlocks: Array.from({ length: height }, (_row, r) => ({
			clientId: `row-${r}`,
			name: 'modular-table-blocks/row',
			attributes: {},
			innerBlocks: Array.from({ length: width }, (_cell, c) => ({
				clientId: `${r}:${c}`,
				name: 'modular-table-blocks/cell',
				attributes: { colSpan: 1, rowSpan: 1 },
				innerBlocks: [
					{
						clientId: `text-${r}:${c}`,
						name: 'core/paragraph',
						attributes: { content: `${r}:${c}` },
						innerBlocks: [],
					},
				],
			})),
		})),
	};
}
function apply(source: BlockTree, operation: TableOperation): BlockTree {
	const plan = planOperation(source, operation);
	expect(plan.errors).toEqual([]);
	expect(plan.changes).not.toBeNull();
	expect(structureErrors(plan.changes!)).toEqual([]);
	return plan.changes!;
}
const merge = (source: BlockTree, bottom = 1, right = 1) =>
	apply(source, { type: 'mergeCells', top: 0, left: 0, bottom, right });
const textIds = (source: BlockTree) =>
	source.innerBlocks
		.flatMap((r) =>
			r.innerBlocks.flatMap((c) => c.innerBlocks.map((b) => b.clientId))
		)
		.filter(Boolean);

describe('M2 merge, split and span-aware plans', () => {
	it('keeps all nested content, order and anchor settings without changing the input', () => {
		const source = table();
		source.innerBlocks[0].innerBlocks[0].attributes.tag = 'th';
		const before = JSON.stringify(source);
		const next = merge(source);
		expect(JSON.stringify(source)).toBe(before);
		const anchor = next.innerBlocks[0].innerBlocks[0];
		expect(anchor.attributes).toMatchObject({
			colSpan: 2,
			rowSpan: 2,
			tag: 'th',
		});
		expect(anchor.innerBlocks.map((b) => b.attributes.content)).toEqual([
			'0:0',
			'0:1',
			'1:0',
			'1:1',
		]);
		expect(anchor.innerBlocks[2]).toBe(
			source.innerBlocks[1].innerBlocks[0].innerBlocks[0]
		);
		expect(textIds(next).sort()).toEqual(textIds(source).sort());
		expect(next.innerBlocks[2]).toBe(source.innerBlocks[2]);
	});
	it('splits into empty cells, leaving content and identity in the top-left cell', () => {
		const source = merge(table());
		const next = apply(source, { type: 'splitCell', row: 0, cell: 0 });
		expect(next.innerBlocks.map((r) => r.innerBlocks.length)).toEqual([
			3, 3, 3,
		]);
		expect(next.innerBlocks[0].innerBlocks[0].innerBlocks).toBe(
			source.innerBlocks[0].innerBlocks[0].innerBlocks
		);
		expect(next.innerBlocks[0].innerBlocks[0].clientId).toBe('0:0');
		expect(next.innerBlocks[1].innerBlocks[1].clientId).toBe('');
		expect(
			next.innerBlocks[1].innerBlocks[1].innerBlocks[0].attributes.content
		).toBeUndefined();
		expect(textIds(next).sort()).toEqual(textIds(source).sort());
	});
	it('accepts complete existing merges and rejects partial intersections and empty selections', () => {
		const source = merge(table(), 0, 1);
		expect(
			planOperation(source, {
				type: 'mergeCells',
				top: 0,
				left: 1,
				bottom: 1,
				right: 2,
			}).errors
		).toEqual(['partial-merge']);
		expect(
			planOperation(source, {
				type: 'mergeCells',
				top: 0,
				left: 0,
				bottom: 0,
				right: 1,
			}).errors
		).toEqual(['partial-merge']);
		expect(
			merge(source).innerBlocks[0].innerBlocks[0].attributes.rowSpan
		).toBe(2);
	});
	it.each([-1, 0.5, 3, NaN])(
		'rejects invalid rectangle coordinate %s',
		(bottom) => {
			expect(
				planOperation(table(), {
					type: 'mergeCells',
					top: 0,
					left: 0,
					bottom,
					right: 1,
				}).errors
			).toEqual(['invalid-selection']);
		}
	);
	it('refuses merges across header sections and ambiguous row moves or copies', () => {
		const source = table();
		source.attributes.headerRows = 1;
		expect(
			planOperation(source, {
				type: 'mergeCells',
				top: 0,
				left: 0,
				bottom: 1,
				right: 0,
			}).errors
		).toEqual(['section-boundary']);
		expect(
			merge(source, 0, 1).innerBlocks[0].innerBlocks[0].attributes.colSpan
		).toBe(2);
		const vertical = merge(table());
		for (const index of [0, 1]) {
			expect(
				planOperation(vertical, { type: 'duplicateRow', index }).errors
			).toEqual(['ambiguous-row-operation']);
			expect(
				planOperation(vertical, {
					type: 'moveRow',
					index,
					destination: 2,
				}).errors
			).toEqual(['ambiguous-row-operation']);
		}
	});
	it('preserves merged content when deleting its origin row or column', () => {
		for (const type of ['deleteRow', 'deleteColumn'] as const) {
			const source = merge(table());
			const next = apply(source, { type, index: 0 });
			const anchor = next.innerBlocks[0].innerBlocks[0];
			expect(anchor.clientId).toBe('0:0');
			expect(anchor.innerBlocks).toBe(
				source.innerBlocks[0].innerBlocks[0].innerBlocks
			);
			expect(
				anchor.attributes[type === 'deleteRow' ? 'rowSpan' : 'colSpan']
			).toBe(1);
			expect(planOperation(source, { type, index: 0 }).warnings).toEqual([
				'delete-content',
			]);
		}
	});
	it('refuses a row deletion that would introduce a span across the header boundary', () => {
		const source = table();
		source.attributes.headerRows = 1;
		const merged = apply(source, {
			type: 'mergeCells',
			top: 1,
			left: 0,
			bottom: 2,
			right: 0,
		});
		expect(
			planOperation(merged, { type: 'deleteRow', index: 0 }).errors
		).toEqual(['section-boundary']);
	});
	it('warns only for content actually removed, not retained span content', () => {
		const source = merge(table(2, 2));
		for (const type of ['deleteRow', 'deleteColumn'] as const) {
			expect(planOperation(source, { type, index: 0 }).warnings).toEqual(
				[]
			);
			expect(textIds(apply(source, { type, index: 0 })).sort()).toEqual(
				textIds(source).sort()
			);
		}
	});
	it('expands spanning cells only for insertion inside their bounds', () => {
		for (const type of ['insertRow', 'insertColumn'] as const) {
			for (const index of [0, 1, 2, 3]) {
				const source = merge(table());
				const next = apply(source, { type, index });
				const anchor = placements(next).find(
					(p) => p.cell.clientId === '0:0'
				)!;
				expect(
					type === 'insertRow' ? anchor.height : anchor.width
				).toBe(index === 1 ? 3 : 2);
				expect(textIds(next).sort()).toEqual(textIds(source).sort());
			}
		}
	});
	it('validates every rectangle and every insertion/deletion boundary on a 3×3 grid', () => {
		for (let top = 0; top < 3; top++) {
			for (let left = 0; left < 3; left++) {
				for (let bottom = top; bottom < 3; bottom++) {
					for (let right = left; right < 3; right++) {
						if (top === bottom && left === right) {
							continue;
						}
						const source = apply(table(), {
							type: 'mergeCells',
							top,
							left,
							bottom,
							right,
						});
						for (const type of [
							'insertRow',
							'insertColumn',
							'deleteRow',
							'deleteColumn',
						] as const) {
							for (
								let index = 0;
								index < (type.startsWith('insert') ? 4 : 3);
								index++
							) {
								const next = apply(source, { type, index });
								const ids = textIds(next);
								expect(new Set(ids).size).toBe(ids.length);
								if (type.startsWith('insert')) {
									expect(ids.sort()).toEqual(
										textIds(source).sort()
									);
								}
							}
						}
						const split = apply(source, {
							type: 'splitCell',
							row: top,
							cell: source.innerBlocks[top].innerBlocks.findIndex(
								(c) => c.clientId === `${top}:${left}`
							),
						});
						expect(textIds(split).sort()).toEqual(
							textIds(source).sort()
						);
					}
				}
			}
		}
	});
});
