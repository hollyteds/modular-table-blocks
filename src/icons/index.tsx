import type { ComponentType, SVGProps } from 'react';
import { ReactComponent as BlockTable } from './svg/block-table.svg';
import { ReactComponent as BlockCell } from './svg/block-cell.svg';
import { ReactComponent as BlockCellText } from './svg/block-cell-text.svg';
import { ReactComponent as ImportTable } from './svg/import-table.svg';
import { ReactComponent as TableStructure } from './svg/table-structure.svg';
import { ReactComponent as MoveRowsColumns } from './svg/move-rows-columns.svg';
import { ReactComponent as MergeSplitCells } from './svg/merge-split-cells.svg';
import { ReactComponent as InsertRowAbove } from './svg/insert-row-above.svg';
import { ReactComponent as InsertRowBelow } from './svg/insert-row-below.svg';
import { ReactComponent as DuplicateRow } from './svg/duplicate-row.svg';
import { ReactComponent as DeleteRow } from './svg/delete-row.svg';
import { ReactComponent as InsertColumnBefore } from './svg/insert-column-before.svg';
import { ReactComponent as InsertColumnAfter } from './svg/insert-column-after.svg';
import { ReactComponent as DuplicateColumn } from './svg/duplicate-column.svg';
import { ReactComponent as DeleteColumn } from './svg/delete-column.svg';
import { ReactComponent as MoveRowUp } from './svg/move-row-up.svg';
import { ReactComponent as MoveRowDown } from './svg/move-row-down.svg';
import { ReactComponent as MoveColumnLeft } from './svg/move-column-left.svg';
import { ReactComponent as MoveColumnRight } from './svg/move-column-right.svg';
import { ReactComponent as AxesLinked } from './svg/axes-linked.svg';
import { ReactComponent as AxesUnlinked } from './svg/axes-unlinked.svg';

// WordPress buttons set svg fill via CSS. Preserve the supplied stroke-only art
// with an intrinsic style while letting currentColor follow pressed/disabled UI.
function decorativeIcon(
	name: string,
	Component: ComponentType<SVGProps<SVGSVGElement>>
) {
	return (
		<Component
			viewBox="0 0 24 24"
			data-mtb-icon={name}
			aria-hidden="true"
			focusable="false"
			style={{ fill: 'none' }}
		/>
	);
}

export const icons = {
	blockTable: decorativeIcon('block-table', BlockTable),
	blockCell: decorativeIcon('block-cell', BlockCell),
	blockCellText: decorativeIcon('block-cell-text', BlockCellText),
	importTable: decorativeIcon('import-table', ImportTable),
	tableStructure: decorativeIcon('table-structure', TableStructure),
	moveRowsColumns: decorativeIcon('move-rows-columns', MoveRowsColumns),
	mergeSplitCells: decorativeIcon('merge-split-cells', MergeSplitCells),
	insertRowAbove: decorativeIcon('insert-row-above', InsertRowAbove),
	insertRowBelow: decorativeIcon('insert-row-below', InsertRowBelow),
	duplicateRow: decorativeIcon('duplicate-row', DuplicateRow),
	deleteRow: decorativeIcon('delete-row', DeleteRow),
	insertColumnBefore: decorativeIcon(
		'insert-column-before',
		InsertColumnBefore
	),
	insertColumnAfter: decorativeIcon('insert-column-after', InsertColumnAfter),
	duplicateColumn: decorativeIcon('duplicate-column', DuplicateColumn),
	deleteColumn: decorativeIcon('delete-column', DeleteColumn),
	moveRowUp: decorativeIcon('move-row-up', MoveRowUp),
	moveRowDown: decorativeIcon('move-row-down', MoveRowDown),
	moveColumnLeft: decorativeIcon('move-column-left', MoveColumnLeft),
	moveColumnRight: decorativeIcon('move-column-right', MoveColumnRight),
	axesLinked: decorativeIcon('axes-linked', AxesLinked),
	axesUnlinked: decorativeIcon('axes-unlinked', AxesUnlinked),
};
