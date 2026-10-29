import { CELL_TEXT_BLOCK } from '../content';
import { buildGrid } from '../grid/build-grid';
import { placements } from '../grid/layout';
import { emptyCell, structureErrors } from '../grid/operations';
import type { BlockTree } from '../grid/operations';
import { checkData, ImportError, IMPORT_LIMITS } from './types';
import type { ImportData } from './types';

export interface ImportOptions {
	mode: 'new' | 'overwrite';
	row: number;
	column: number;
	firstRowHeader: boolean;
}
export interface ImportPlan {
	table: BlockTree;
	targetIds: string[];
	overwriteCount: number;
	addedRows: number;
	addedColumns: number;
}

/**
 * Encode literal values for RichText; source HTML is never used as block content.
 * @param value
 */
export function richText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;')
		.replace(/\n/g, '<br>');
}
export function importLocked(block: BlockTree): boolean {
	const lock = block.attributes.lock as
		{ remove?: boolean; move?: boolean } | undefined;
	return (
		!!(lock?.remove || lock?.move || block.attributes.templateLock) ||
		block.innerBlocks.some(importLocked)
	);
}
export function hasImportContent(cell: BlockTree): boolean {
	return cell.innerBlocks.some(
		(block) =>
			block.name !== CELL_TEXT_BLOCK ||
			block.innerBlocks.length > 0 ||
			(block.attributes.content !== undefined &&
				String(block.attributes.content) !== '')
	);
}
function withText(cell: BlockTree, text: string): BlockTree {
	return {
		...cell,
		innerBlocks: [
			{
				clientId: '',
				name: CELL_TEXT_BLOCK,
				attributes: { content: richText(text) },
				innerBlocks: [],
			},
		],
	};
}
export function planImport(
	source: BlockTree,
	data: ImportData,
	options: ImportOptions
): ImportPlan {
	checkData(data);
	const inputGrid = buildGrid(
		data.cells.map((cell, i) => ({ ...cell, clientId: String(i) })),
		data.rows,
		data.columns
	);
	if (inputGrid.errors.length) {
		throw new ImportError('grid');
	}
	if (options.mode === 'new') {
		let headerRows = options.firstRowHeader ? 1 : 0;
		if (data.format === 'html') {
			headerRows = data.headerRows;
		}
		const cells = data.cells.map((cell) => {
			const block = withText(emptyCell(), cell.text);
			block.attributes = {
				row: cell.row,
				column: cell.column,
				rowSpan: cell.rowSpan,
				colSpan: cell.colSpan,
				tag: cell.tag,
			};
			return block;
		});
		for (let row = 0; row < data.rows; row++) {
			for (let column = 0; column < data.columns; column++) {
				if (!inputGrid.slots[row][column]) {
					cells.push({ ...emptyCell(), attributes: { row, column } });
				}
			}
		}
		const table: BlockTree = {
			clientId: '',
			name: 'modular-table-blocks/table',
			attributes: {
				rowCount: data.rows,
				columns: Array.from({ length: data.columns }, () => ({})),
				headerRows,
			},
			innerBlocks: cells.sort(
				(a, b) =>
					Number(a.attributes.row) - Number(b.attributes.row) ||
					Number(a.attributes.column) - Number(b.attributes.column)
			),
		};
		if (structureErrors(table).length) {
			throw new ImportError('merge');
		}
		return {
			table,
			targetIds: [],
			overwriteCount: 0,
			addedRows: data.rows,
			addedColumns: data.columns,
		};
	}
	if (structureErrors(source).length) {
		throw new ImportError('grid');
	}
	const existing = placements(source);
	const anchor = existing.find(
		(p) => p.row === options.row && p.column === options.column
	);
	if (!anchor) {
		throw new ImportError('anchor');
	}
	const scalar =
		data.rows === 1 && data.columns === 1 && data.cells.length === 1;
	if (!scalar) {
		const incoming = new Map(
			data.cells.map((cell) => [`${cell.row}:${cell.column}`, cell])
		);
		for (const p of existing) {
			if (
				(p.width === 1 && p.height === 1) ||
				p.row >= options.row + data.rows ||
				p.row + p.height <= options.row ||
				p.column >= options.column + data.columns ||
				p.column + p.width <= options.column
			) {
				continue;
			}
			const match = incoming.get(
				`${p.row - options.row}:${p.column - options.column}`
			);
			if (
				!match ||
				match.rowSpan !== p.height ||
				match.colSpan !== p.width
			) {
				throw new ImportError('merge', p.row, p.column);
			}
		}
	}
	const oldRows = Number(source.attributes.rowCount);
	const columns = source.attributes.columns as Record<string, unknown>[];
	const rows = Math.max(oldRows, options.row + data.rows);
	const width = Math.max(columns.length, options.column + data.columns);
	if (rows > IMPORT_LIMITS.rows || width > IMPORT_LIMITS.columns) {
		throw new ImportError('limit');
	}
	const bySlot = new Map<string, BlockTree>();
	for (const p of existing) {
		for (let r = p.row; r < p.row + p.height; r++) {
			for (let c = p.column; c < p.column + p.width; c++) {
				bySlot.set(`${r}:${c}`, p.cell);
			}
		}
	}
	const updates = new Map<BlockTree, BlockTree>();
	let overwriteCount = 0;
	for (const input of data.cells) {
		const row = options.row + input.row;
		const column = options.column + input.column;
		const cell = bySlot.get(`${row}:${column}`);
		if (cell) {
			// Gutenberg serializes an invalid block from originalContent. Refuse
			// rather than show an imported value that would be lost when saving.
			if (cell.isValid === false) {
				throw new ImportError('grid', row, column);
			}
			if (
				!scalar &&
				(cell.attributes.row !== row ||
					cell.attributes.column !== column ||
					(cell.attributes.rowSpan ?? 1) !== input.rowSpan ||
					(cell.attributes.colSpan ?? 1) !== input.colSpan)
			) {
				throw new ImportError('merge', row, column);
			}
			if (importLocked(cell)) {
				throw new ImportError('locked', row, column);
			}
			if (hasImportContent(cell)) {
				overwriteCount++;
			}
			updates.set(cell, withText(cell, input.text));
		} else {
			// Existing-table imports do not create or silently change merge geometry.
			if (input.rowSpan !== 1 || input.colSpan !== 1) {
				throw new ImportError('merge', row, column);
			}
			const added = withText(
				{ ...emptyCell(), attributes: { row, column } },
				input.text
			);
			bySlot.set(`${row}:${column}`, added);
		}
	}
	const cells = source.innerBlocks.map((cell) => updates.get(cell) ?? cell);
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < width; column++) {
			if (row < oldRows && column < columns.length) {
				continue;
			}
			cells.push(
				bySlot.get(`${row}:${column}`) ?? {
					...emptyCell(),
					attributes: { row, column },
				}
			);
		}
	}
	const table = {
		...source,
		attributes: {
			...source.attributes,
			rowCount: rows,
			columns: [
				...columns,
				...Array.from({ length: width - columns.length }, () => ({})),
			],
		},
		innerBlocks: cells.sort(
			(a, b) =>
				Number(a.attributes.row) - Number(b.attributes.row) ||
				Number(a.attributes.column) - Number(b.attributes.column)
		),
	};
	if (structureErrors(table).length) {
		throw new ImportError('grid');
	}
	return {
		table,
		targetIds: [...updates.keys()].map((cell) => cell.clientId),
		overwriteCount,
		addedRows: rows - oldRows,
		addedColumns: width - columns.length,
	};
}
