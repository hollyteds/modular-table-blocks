import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree, TableOperation } from '../../src/grid/operations';
import { placements } from '../../src/grid/layout';

function table(height = 3, width = 3): BlockTree {
	const source = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: { headerRows: 0 },
			innerBlocks: [],
		},
		{ type: 'initialize', rows: height, columns: width }
	).changes!;
	for (const cell of source.innerBlocks) {
		const id = `${cell.attributes.row}:${cell.attributes.column}`;
		cell.clientId = id;
		cell.innerBlocks = [
			{
				clientId: `text-${id}`,
				name: 'core/paragraph',
				attributes: { content: id },
				innerBlocks: [],
			},
		];
	}
	return source;
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
		.flatMap((cell) => cell.innerBlocks.map((b) => b.clientId))
		.filter(Boolean);

describe('M2 merge, split and span-aware plans', () => {
	it('keeps only anchor content and settings and plans other content deletion without changing the input', () => {
		const source = table();
		source.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.tag = 'th';
		const before = JSON.stringify(source);
		const next = merge(source);
		expect(JSON.stringify(source)).toBe(before);
		const anchor = next.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		expect(anchor.attributes).toMatchObject({
			colSpan: 2,
			rowSpan: 2,
			tag: 'th',
		});
		expect(anchor.innerBlocks.map((b) => b.attributes.content)).toEqual([
			'0:0',
		]);
		expect(anchor.innerBlocks).toBe(source.innerBlocks[0].innerBlocks);
		expect(textIds(next).sort()).toEqual([
			'text-0:0',
			'text-0:2',
			'text-1:2',
			'text-2:0',
			'text-2:1',
			'text-2:2',
		]);
		expect(next.innerBlocks.find((cell) => cell.clientId === '2:0')).toBe(
			source.innerBlocks.find((cell) => cell.clientId === '2:0')
		);
	});
	it('warns for every non-anchor cell with child blocks, including empty and locked nested blocks', () => {
		const source = table(2, 2);
		source.attributes.lock = { remove: true, move: true };
		source.innerBlocks[0].attributes.lock = { remove: true };
		source.innerBlocks[1].innerBlocks[0].attributes = {
			content: '',
			lock: { remove: true },
		};
		source.innerBlocks[2].innerBlocks = [
			{
				clientId: 'locked-group',
				name: 'core/group',
				attributes: { lock: { remove: true, move: true } },
				innerBlocks: source.innerBlocks[2].innerBlocks,
			},
		];
		source.innerBlocks[3].innerBlocks = [];
		const before = JSON.stringify(source);
		const plan = planOperation(source, {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: 1,
			right: 1,
		});
		expect(plan.warnings).toEqual(['merge-delete-content']);
		expect(plan.discardedCells).toEqual([
			{ row: 0, column: 1 },
			{ row: 1, column: 0 },
		]);
		expect(plan.changes!.innerBlocks[0].innerBlocks).toBe(
			source.innerBlocks[0].innerBlocks
		);
		expect(plan.changes!.innerBlocks[0].attributes.lock).toEqual({
			remove: true,
		});
		expect(plan.changes!.attributes.lock).toEqual(source.attributes.lock);
		expect(JSON.stringify(source)).toBe(before);
	});
	it('does not warn when other cells have no child blocks, regardless of their locks', () => {
		const source = table(2, 2);
		for (const cell of source.innerBlocks.slice(1)) {
			cell.innerBlocks = [];
			cell.attributes.lock = { remove: true, move: true };
		}
		const plan = planOperation(source, {
			type: 'mergeCells',
			top: 0,
			left: 0,
			bottom: 1,
			right: 1,
		});
		expect(plan.warnings).toEqual([]);
		expect(plan.discardedCells).toEqual([]);
		expect(plan.changes!.innerBlocks[0].innerBlocks).toBe(
			source.innerBlocks[0].innerBlocks
		);
	});
	it('splits into cells with blank cell text, leaving content and identity in the top-left cell', () => {
		const source = merge(table());
		const next = apply(source, { type: 'splitCell', row: 0, cell: 0 });
		expect(
			Array.from(
				{ length: Number(next.attributes.rowCount) },
				(_, r) =>
					next.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					).length
			)
		).toEqual([3, 3, 3]);
		expect(
			next.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks
		).toBe(
			source.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks
		);
		expect(
			next.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].clientId
		).toBe('0:0');
		expect(
			next.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 1
			)[1].clientId
		).toBe('');
		expect(
			next.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 1
			)[1].innerBlocks
		).toEqual([
			{
				clientId: '',
				name: 'modular-table-blocks/cell-text',
				attributes: { content: '' },
				innerBlocks: [],
			},
		]);
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
			merge(source).innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].attributes.rowSpan
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
			merge(source, 0, 1).innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].attributes.colSpan
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
			const anchor = next.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
			expect(anchor.clientId).toBe('0:0');
			expect(anchor.innerBlocks).toBe(
				source.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].innerBlocks
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
							cell: source.innerBlocks
								.filter(
									(candidate) =>
										candidate.attributes.row === top
								)
								.findIndex(
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
