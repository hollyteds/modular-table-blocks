import { BulkError } from './errors';
import type { BlockTree } from '../grid/operations';
import { structureErrors } from '../grid/operations';
import { placements } from '../grid/layout';
import { cellSemantics } from '../grid/cell-type';
import type { Placement } from '../grid/layout';
import { sides } from '../styles/sides';
import type { Side } from '../styles/sides';
import type { BulkField, BulkSelection } from './types';

export function toggleBulkAll(selection: BulkSelection): BulkSelection {
	return {
		mode: 'all',
		indices: [],
		all: !(selection.mode === 'all' && selection.all),
	};
}

export function selectBulkAxis(
	selection: BulkSelection,
	mode: 'rows' | 'columns',
	index: number
): BulkSelection {
	const indices = selection.mode === mode ? selection.indices : [];
	return {
		mode,
		all: false,
		indices: indices.includes(index)
			? indices.filter((item) => item !== index)
			: [...indices, index].sort((a, b) => a - b),
	};
}

export function structureSignature(table: BlockTree): string {
	return JSON.stringify([
		table.clientId,
		table.attributes.rowCount,
		table.attributes.headerRows,
		table.attributes.columns,
		table.attributes.columnWidthMode,
		table.innerBlocks.map((cell) => [
			cell.clientId,
			cell.name,
			cell.attributes.row,
			cell.attributes.column,
			cell.attributes.colSpan ?? 1,
			cell.attributes.rowSpan ?? 1,
		]),
	]);
}

export function selectedCells(
	table: BlockTree,
	selection: BulkSelection
): Placement[] {
	return placements(table).filter((p) => intersectsSelection(p, selection));
}

export function intersectsSelection(
	p: Placement,
	selection: BulkSelection
): boolean {
	if (selection.mode === 'all') {
		return selection.all;
	}
	const start = selection.mode === 'rows' ? p.row : p.column;
	const size = selection.mode === 'rows' ? p.height : p.width;
	return selection.indices.some(
		(index) => index >= start && index < start + size
	);
}

export function crossesSelection(
	p: Placement,
	selection: BulkSelection
): boolean {
	if (selection.mode === 'all') {
		return false;
	}
	const start = selection.mode === 'rows' ? p.row : p.column;
	const size = selection.mode === 'rows' ? p.height : p.width;
	return Array.from({ length: size }, (_, index) => start + index).some(
		(index) => !selection.indices.includes(index)
	);
}

export function selectionSides(p: Placement, selection: BulkSelection): Side[] {
	if (selection.mode === 'all') {
		return selection.all ? [...sides] : [];
	}
	if (!crossesSelection(p, selection)) {
		const start = selection.mode === 'rows' ? p.row : p.column;
		return selection.indices.includes(start) ? [...sides] : [];
	}
	const start = selection.mode === 'rows' ? p.row : p.column;
	const size = selection.mode === 'rows' ? p.height : p.width;
	const pair: Side[] =
		selection.mode === 'rows' ? ['top', 'bottom'] : ['left', 'right'];
	return pair.filter((_side, index) =>
		selection.indices.includes(start + (index ? size - 1 : 0))
	);
}

export function cellsForField(
	cells: Placement[],
	selection: BulkSelection,
	field: BulkField,
	table?: BlockTree
): Placement[] {
	const side = field.split('.')[1] as Side | undefined;
	return cells.filter(
		(p) =>
			(field !== 'tag' ||
				!table ||
				!cellSemantics(table.attributes, p.cell.attributes)
					.isManagedHeader) &&
			(side
				? selectionSides(p, selection).includes(side)
				: intersectsSelection(p, selection))
	);
}

export function selectsWholeTable(
	table: BlockTree,
	selection: BulkSelection
): boolean {
	if (selection.mode === 'all') {
		return selection.all;
	}
	const count =
		selection.mode === 'rows'
			? Number(table.attributes.rowCount)
			: (table.attributes.columns as unknown[]).length;
	return Array.from({ length: count }, (_, index) => index).every((index) =>
		selection.indices.includes(index)
	);
}

export function checkStructure(table: BlockTree, signature: string) {
	if (
		structureErrors(table).length ||
		structureSignature(table) !== signature
	) {
		throw new BulkError('stale-structure');
	}
}

export function checkedSelection(table: BlockTree, selection: BulkSelection) {
	const size =
		selection.mode === 'rows'
			? Number(table.attributes.rowCount)
			: (table.attributes.columns as unknown[]).length;
	if (
		selection.indices.some(
			(index) => !Number.isInteger(index) || index < 0 || index >= size
		)
	) {
		throw new BulkError('invalid-selection');
	}
	const cells = selectedCells(table, selection);
	if (!cells.length) {
		throw new BulkError('empty-selection');
	}
	return cells;
}
