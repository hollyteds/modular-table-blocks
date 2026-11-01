import { TABLE_LIMITS } from './limits';
import { validateGrid } from './build-grid';
import { CELL_TEXT_BLOCK } from '../content';
import { validColumnWidth } from '../styles/columns';
import { cellSemantics } from './cell-type';
import { tableGrid, placements, placeCells, headerCount } from './layout';
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
			type: 'insertRow' | 'insertColumn';
			index: number;
			sourceIndex?: number;
	  }
	| {
			type:
				| 'deleteRow'
				| 'duplicateRow'
				| 'deleteColumn'
				| 'duplicateColumn';
			index: number;
	  }
	| { type: 'moveRow' | 'moveColumn'; index: number; destination: number }
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
	discardedCells?: { row: number; column: number }[];
}

export function emptyCell(): BlockTree {
	return {
		clientId: '',
		name: 'modular-table-blocks/cell',
		attributes: {},
		innerBlocks: [
			{
				clientId: '',
				name: CELL_TEXT_BLOCK,
				attributes: { content: '' },
				innerBlocks: [],
			},
		],
	};
}

function copyStyleValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(copyStyleValue);
	}
	return value && typeof value === 'object'
		? Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					copyStyleValue(item),
				])
			)
		: value;
}

/**
 * Copy explicit decoration and cell type; content, identity and locks stay separate.
 * @param source
 * @param table
 */
function styledEmptyCell(source: BlockTree, table: BlockTree): BlockTree {
	const cell = emptyCell();
	for (const key of [
		'style',
		'styleTokens',
		'textColor',
		'backgroundColor',
		'fontSize',
		'fontFamily',
		'className',
		'horizontalAlign',
		'verticalAlign',
	]) {
		if (source.attributes[key] !== undefined) {
			cell.attributes[key] = copyStyleValue(source.attributes[key]);
		}
	}
	const { tag, isManagedHeader } = cellSemantics(
		table.attributes,
		source.attributes
	);
	cell.attributes.tag = tag;
	const scope = isManagedHeader ? 'col' : source.attributes.scope;
	if (
		tag === 'th' &&
		typeof scope === 'string' &&
		['', 'col', 'row', 'colgroup', 'rowgroup'].includes(scope)
	) {
		cell.attributes.scope = scope;
	}
	return cell;
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
			(block.name !== 'core/paragraph' &&
				block.name !== CELL_TEXT_BLOCK) ||
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
		table.innerBlocks.length === 0 ||
		table.innerBlocks.length > TABLE_LIMITS.rows * TABLE_LIMITS.columns ||
		(table.attributes.headerRows !== undefined &&
			(!Number.isInteger(table.attributes.headerRows) ||
				Number(table.attributes.headerRows) < 0 ||
				Number(table.attributes.headerRows) >
					Number(table.attributes.rowCount)))
	) {
		return ['invalid-grid'];
	}
	if (
		table.innerBlocks.some(
			(cell) => cell.name !== 'modular-table-blocks/cell'
		) ||
		validateGrid(tableGrid(table)).length
	) {
		return ['invalid-grid'];
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
			operation.rows > TABLE_LIMITS.initialRows ||
			operation.columns < 1 ||
			operation.columns > TABLE_LIMITS.initialColumns
		) {
			return reject('invalid-dimensions');
		}
		return {
			changes: {
				...table,
				attributes: {
					...table.attributes,
					rowCount: operation.rows,
					columns: Array.from(
						{ length: operation.columns },
						() => ({})
					),
				},
				innerBlocks: Array.from(
					{ length: operation.rows * operation.columns },
					(_, i) => ({
						...emptyCell(),
						attributes: {
							row: Math.floor(i / operation.columns),
							column: i % operation.columns,
						},
					})
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
	const rows = Array.from(
		{ length: table.attributes.rowCount as number },
		(_, i) => i
	);
	let cells = placements(table);
	const warnings: string[] = [];
	const finish = (): OperationPlan => {
		const next = {
			...table,
			attributes: { ...table.attributes, columns, rowCount: rows.length },
			innerBlocks: placeCells(cells),
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
		const discardedCells = selected
			.filter((p) => p !== anchor && p.cell.innerBlocks.length > 0)
			.map((p) => ({ row: p.row, column: p.column }));
		if (discardedCells.length) {
			warnings.push('merge-delete-content');
		}
		const merged: Placement = {
			...anchor,
			width: right - left + 1,
			height: bottom - top + 1,
			cell: anchor.cell,
		};
		cells = cells.filter((p) => !selected.includes(p));
		cells.push(merged);
		return { ...finish(), discardedCells };
	}
	if (operation.type === 'splitCell') {
		const target = cells.filter((p) => p.row === operation.row)[
			operation.cell
		]?.cell;
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
		operation.type === 'insertColumn' ||
		operation.type === 'deleteColumn' ||
		operation.type === 'duplicateColumn' ||
		operation.type === 'moveColumn';
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
	const sourceIndex = inserting
		? (operation.sourceIndex ?? Math.min(operation.index, size - 1))
		: 0;
	if (
		inserting &&
		(!Number.isInteger(sourceIndex) ||
			sourceIndex < 0 ||
			sourceIndex >= size)
	) {
		return reject('invalid-index');
	}
	// Resolve occupied slots in the original table, before shifting or extending merges.
	const sourceGrid = inserting ? tableGrid(table) : null;
	const insertedCell = (row: number, column: number) =>
		styledEmptyCell(
			table.innerBlocks[
				sourceGrid!.slots[columnOperation ? row : sourceIndex][
					columnOperation ? sourceIndex : column
				]!.origin.cellIndex
			],
			table
		);
	switch (operation.type) {
		case 'insertRow':
		case 'duplicateRow': {
			if (rows.length >= TABLE_LIMITS.rows) {
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
			rows.splice(index, 0, -1);
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
						cell: insertedCell(index, c),
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
			if (columns.length >= TABLE_LIMITS.columns) {
				return reject('size-limit');
			}
			columns.splice(
				operation.index,
				0,
				validColumnWidth(columns[sourceIndex].width)
					? { width: columns[sourceIndex].width }
					: {}
			);
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
						cell: insertedCell(r, operation.index),
					});
				}
			}
			break;
		case 'duplicateColumn': {
			if (columns.length >= TABLE_LIMITS.columns) {
				return reject('size-limit');
			}
			if (
				cells.some(
					(p) =>
						p.width > 1 &&
						p.column <= operation.index &&
						p.column + p.width > operation.index
				)
			) {
				return reject('ambiguous-column-operation');
			}
			const index = operation.index + 1;
			const copied = cells
				.filter((p) => p.column === operation.index)
				.map((p) => ({
					...p,
					column: index,
					cell: withoutIds(p.cell),
				}));
			columns.splice(index, 0, { ...columns[operation.index] });
			cells = cells.map((p) =>
				p.column >= index ? { ...p, column: p.column + 1 } : p
			);
			cells.push(...copied);
			break;
		}
		case 'moveColumn': {
			if (
				!Number.isInteger(operation.destination) ||
				operation.destination < 0 ||
				operation.destination >= columns.length ||
				operation.index === operation.destination
			) {
				return reject('invalid-index');
			}
			const start = Math.min(operation.index, operation.destination);
			const end = Math.max(operation.index, operation.destination);
			if (
				cells.some(
					(p) =>
						p.width > 1 &&
						p.column <= end &&
						p.column + p.width > start
				)
			) {
				return reject('ambiguous-column-operation');
			}
			const order = columns.map((_column, index) => index);
			const [from] = order.splice(operation.index, 1);
			order.splice(operation.destination, 0, from);
			const [column] = columns.splice(operation.index, 1);
			columns.splice(operation.destination, 0, column);
			cells = cells.map((p) => ({
				...p,
				column: order.indexOf(p.column),
			}));
			break;
		}
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
