import { validateGrid } from './build-grid';
import { tableGrid, placements, placeRows, headerCount } from './layout';
import type { Placement } from './layout';

/** A transient block tree, never a second persisted representation of the table. */
export interface BlockTree {
	isValid?: boolean;
	clientId: string;
	name: string;
	attributes: Record<string, unknown>;
	innerBlocks: BlockTree[];
}

export type TableOperation =
	| { type: 'initialize'; rows: number; columns: number }
	| {
			type:
				| 'insertRow'
				| 'deleteRow'
				| 'duplicateRow'
				| 'insertColumn'
				| 'deleteColumn';
			index: number;
	  }
	| { type: 'moveRow'; index: number; destination: number }
	| {
			type: 'mergeCells';
			top: number;
			left: number;
			bottom: number;
			right: number;
	  }
	| { type: 'splitCell'; row: number; cell: number };

export interface OperationPlan {
	changes: BlockTree | null;
	warnings: string[];
	errors: string[];
}

export function emptyCell(): BlockTree {
	return {
		clientId: '',
		name: 'modular-table-blocks/cell',
		attributes: {},
		innerBlocks: [
			{
				clientId: '',
				name: 'core/paragraph',
				attributes: {},
				innerBlocks: [],
			},
		],
	};
}

function emptyRow(columns: number): BlockTree {
	return {
		clientId: '',
		name: 'modular-table-blocks/row',
		attributes: { section: 'body' },
		innerBlocks: Array.from({ length: columns }, emptyCell),
	};
}

function withoutIds(block: BlockTree): BlockTree {
	return {
		...block,
		isValid: block.isValid ?? true,
		clientId: '',
		attributes: { ...block.attributes },
		innerBlocks: block.innerBlocks.map(withoutIds),
	};
}

function hasContent(cell: BlockTree): boolean {
	return cell.innerBlocks.some(
		(block) =>
			block.name !== 'core/paragraph' ||
			block.innerBlocks.length > 0 ||
			Object.entries(block.attributes).some(([key, value]) => {
				if (key === 'content') {
					return String(value ?? '') !== '';
				}
				return (
					value !== undefined &&
					!(key === 'dropCap' && value === false)
				);
			})
	);
}

function columnSettings(value: unknown): Record<string, unknown> | null {
	// WordPress KSES parses and reserializes block attributes in PHP. An empty
	// JSON object becomes [] there; both represent an automatic-width column.
	if (Array.isArray(value)) {
		return value.length === 0 ? {} : null;
	}
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;
}

export function structureErrors(table: BlockTree): string[] {
	if (
		table.name !== 'modular-table-blocks/table' ||
		!Array.isArray(table.attributes.columns) ||
		table.attributes.columns.some(
			(column: unknown) => !columnSettings(column)
		) ||
		table.innerBlocks.length === 0
	) {
		return ['invalid-grid'];
	}
	if (
		table.innerBlocks.some(
			(row) =>
				row.name !== 'modular-table-blocks/row' ||
				row.innerBlocks.some(
					(cell) => cell.name !== 'modular-table-blocks/cell'
				)
		)
	) {
		return ['invalid-grid'];
	}
	if (validateGrid(tableGrid(table)).length > 0) {
		return ['invalid-grid'];
	}
	if (
		table.innerBlocks.some(
			(row) =>
				row.attributes.section !== undefined &&
				row.attributes.section !== 'body'
		)
	) {
		return ['section-boundary'];
	}
	const headers = headerCount(table);
	if (
		placements(table).some(
			(p) => p.row < headers && p.row + p.height > headers
		)
	) {
		return ['section-boundary'];
	}
	return [];
}

/**
 * Build an immutable plan. Blank clientIds mean new blocks, allocated only on apply.
 * @param table
 * @param operation
 */
export function planOperation(
	table: BlockTree,
	operation: TableOperation
): OperationPlan {
	const reject = (code: string): OperationPlan => ({
		changes: null,
		warnings: [],
		errors: [code],
	});
	if (operation.type === 'initialize') {
		if (
			table.name !== 'modular-table-blocks/table' ||
			table.innerBlocks.length !== 0 ||
			!Number.isInteger(operation.rows) ||
			!Number.isInteger(operation.columns) ||
			operation.rows < 1 ||
			operation.rows > 20 ||
			operation.columns < 1 ||
			operation.columns > 20
		) {
			return reject('invalid-dimensions');
		}
		return {
			changes: {
				...table,
				attributes: {
					...table.attributes,
					columns: Array.from(
						{ length: operation.columns },
						() => ({})
					),
				},
				innerBlocks: Array.from({ length: operation.rows }, () =>
					emptyRow(operation.columns)
				),
			},
			warnings: [],
			errors: [],
		};
	}
	const errors = structureErrors(table);
	if (errors.length > 0) {
		return { changes: null, warnings: [], errors };
	}
	const columns = (table.attributes.columns as unknown[]).map((column) =>
		columnSettings(column)!
	);
	const rows = [...table.innerBlocks];
	let cells = placements(table);
	const warnings: string[] = [];
	const finish = (): OperationPlan => {
		const next = {
			...table,
			attributes: { ...table.attributes, columns },
			innerBlocks: placeRows(rows, cells),
		};
		const issues = structureErrors(next);
		return issues.length
			? reject(issues[0])
			: { changes: next, warnings, errors: [] };
	};
	if (operation.type === 'mergeCells') {
		const { top, left, bottom, right } = operation;
		if (
			![top, left, bottom, right].every(Number.isInteger) ||
			top < 0 ||
			left < 0 ||
			bottom < top ||
			right < left ||
			bottom >= rows.length ||
			right >= columns.length
		) {
			return reject('invalid-selection');
		}
		const headers = headerCount(table);
		if (top < headers && bottom >= headers) {
			return reject('section-boundary');
		}
		const selected = cells.filter(
			(p) =>
				p.row <= bottom &&
				p.row + p.height > top &&
				p.column <= right &&
				p.column + p.width > left
		);
		if (
			selected.length < 2 ||
			selected.some(
				(p) =>
					p.row < top ||
					p.column < left ||
					p.row + p.height - 1 > bottom ||
					p.column + p.width - 1 > right
			)
		) {
			return reject('partial-merge');
		}
		const anchor = selected.find((p) => p.row === top && p.column === left);
		if (!anchor) {
			return reject('invalid-selection');
		}
		const merged: Placement = {
			...anchor,
			width: right - left + 1,
			height: bottom - top + 1,
			cell: {
				...anchor.cell,
				innerBlocks: selected.flatMap((p) => p.cell.innerBlocks),
			},
		};
		cells = cells.filter((p) => !selected.includes(p));
		cells.push(merged);
		return finish();
	}
	if (operation.type === 'splitCell') {
		const target = rows[operation.row]?.innerBlocks[operation.cell];
		if (
			!Number.isInteger(operation.row) ||
			!Number.isInteger(operation.cell) ||
			!target
		) {
			return reject('invalid-index');
		}
		const origin = cells.find((p) => p.cell === target)!;
		if (origin.width === 1 && origin.height === 1) {
			return reject('not-merged');
		}
		cells = cells.filter((p) => p !== origin);
		for (let r = 0; r < origin.height; r++) {
			for (let c = 0; c < origin.width; c++) {
				const cell =
					r === 0 && c === 0
						? target
						: {
								...emptyCell(),
								attributes: {
									...target.attributes,
									colSpan: 1,
									rowSpan: 1,
								},
							};
				cells.push({
					row: origin.row + r,
					column: origin.column + c,
					width: 1,
					height: 1,
					cell,
				});
			}
		}
		return finish();
	}
	const columnOperation =
		operation.type === 'insertColumn' || operation.type === 'deleteColumn';
	const size = columnOperation ? columns.length : rows.length;
	const inserting =
		operation.type === 'insertRow' || operation.type === 'insertColumn';
	if (
		!Number.isInteger(operation.index) ||
		operation.index < 0 ||
		operation.index >= size + (inserting ? 1 : 0)
	) {
		return reject('invalid-index');
	}
	switch (operation.type) {
		case 'insertRow':
		case 'duplicateRow': {
			if (rows.length >= 100) {
				return reject('size-limit');
			}
			const duplicate = operation.type === 'duplicateRow';
			if (
				duplicate &&
				cells.some(
					(p) =>
						p.height > 1 &&
						p.row <= operation.index &&
						p.row + p.height > operation.index
				)
			) {
				return reject('ambiguous-row-operation');
			}
			const index = operation.index + (duplicate ? 1 : 0);
			const copied = duplicate
				? cells
						.filter((p) => p.row === operation.index)
						.map((p) => ({
							...p,
							row: index,
							cell: withoutIds(p.cell),
						}))
				: [];
			const row = duplicate
				? { ...withoutIds(rows[operation.index]), innerBlocks: [] }
				: emptyRow(0);
			rows.splice(index, 0, row);
			cells = cells.map((p) => {
				if (p.row >= index) {
					return { ...p, row: p.row + 1 };
				}
				if (p.row + p.height > index) {
					return { ...p, height: p.height + 1 };
				}
				return p;
			});
			cells.push(...copied);
			for (let c = 0; c < columns.length; c++) {
				if (
					!cells.some(
						(p) =>
							p.row <= index &&
							p.row + p.height > index &&
							p.column <= c &&
							p.column + p.width > c
					)
				) {
					cells.push({
						row: index,
						column: c,
						width: 1,
						height: 1,
						cell: emptyCell(),
					});
				}
			}
			break;
		}
		case 'deleteRow':
			if (rows.length === 1) {
				return reject('last-row');
			}
			if (
				cells.some(
					(p) =>
						p.row === operation.index &&
						p.height === 1 &&
						hasContent(p.cell)
				)
			) {
				warnings.push('delete-content');
			}
			cells = cells.flatMap((p) => {
				if (p.row > operation.index) {
					return [{ ...p, row: p.row - 1 }];
				}
				if (p.row + p.height <= operation.index) {
					return [p];
				}
				if (p.height === 1) {
					return [];
				}
				return [{ ...p, height: p.height - 1 }];
			});
			rows.splice(operation.index, 1);
			break;
		case 'moveRow': {
			if (
				!Number.isInteger(operation.destination) ||
				operation.destination < 0 ||
				operation.destination >= rows.length ||
				operation.index === operation.destination
			) {
				return reject('invalid-index');
			}
			const start = Math.min(operation.index, operation.destination);
			const end = Math.max(operation.index, operation.destination);
			if (
				cells.some(
					(p) =>
						p.height > 1 && p.row <= end && p.row + p.height > start
				)
			) {
				return reject('ambiguous-row-operation');
			}
			const rowIds = [...rows];
			const [row] = rows.splice(operation.index, 1);
			rows.splice(operation.destination, 0, row);
			cells = cells.map((p) => ({
				...p,
				row: rows.indexOf(rowIds[p.row]),
			}));
			break;
		}
		case 'insertColumn':
			if (columns.length >= 50) {
				return reject('size-limit');
			}
			columns.splice(operation.index, 0, {});
			cells = cells.map((p) => {
				if (p.column >= operation.index) {
					return { ...p, column: p.column + 1 };
				}
				if (p.column + p.width > operation.index) {
					return { ...p, width: p.width + 1 };
				}
				return p;
			});
			for (let r = 0; r < rows.length; r++) {
				if (
					!cells.some(
						(p) =>
							p.column <= operation.index &&
							p.column + p.width > operation.index &&
							p.row <= r &&
							p.row + p.height > r
					)
				) {
					cells.push({
						row: r,
						column: operation.index,
						width: 1,
						height: 1,
						cell: emptyCell(),
					});
				}
			}
			break;
		case 'deleteColumn':
			if (columns.length === 1) {
				return reject('last-column');
			}
			if (
				cells.some(
					(p) =>
						p.column === operation.index &&
						p.width === 1 &&
						hasContent(p.cell)
				)
			) {
				warnings.push('delete-content');
			}
			columns.splice(operation.index, 1);
			cells = cells.flatMap((p) => {
				if (p.column > operation.index) {
					return [{ ...p, column: p.column - 1 }];
				}
				if (p.column + p.width <= operation.index) {
					return [p];
				}
				if (p.width === 1) {
					return [];
				}
				return [{ ...p, width: p.width - 1 }];
			});
			break;
	}
	return finish();
}
