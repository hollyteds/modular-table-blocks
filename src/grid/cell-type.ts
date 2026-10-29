/**
 * Header rows remain managed by the table; body cells keep their own type.
 * @param table
 * @param table.headerRows
 * @param cell
 * @param cell.row
 * @param cell.tag
 */
export function cellSemantics(
	table: { headerRows?: unknown },
	cell: { row?: unknown; tag?: unknown }
): { tag: 'th' | 'td'; isManagedHeader: boolean } {
	const isManagedHeader =
		Number.isInteger(cell.row) &&
		Number(cell.row) >= 0 &&
		Number(cell.row) < headerRowCount(table.headerRows);
	return {
		tag: isManagedHeader || cell.tag === 'th' ? 'th' : 'td',
		isManagedHeader,
	};
}

export function headerRowCount(value: unknown): number {
	return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
		? Number(value)
		: 0;
}

export function effectiveCellTag(
	table: { headerRows?: unknown },
	cell: { row?: unknown; tag?: unknown }
): 'th' | 'td' {
	return cellSemantics(table, cell).tag;
}
