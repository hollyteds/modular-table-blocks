import { cellSemantics, headerRowCount } from '../grid/cell-type';
import { isValidToken } from './tokens';
import type { NativeStyleAttributes } from './native';

export type BackgroundAttributes = NativeStyleAttributes & {
	stripeMode?: unknown;
	headerRows?: unknown;
};

/**
 * Derived only: never persist per-cell stripe positions or colors.
 * @param table
 * @param cell
 */
export function backgroundRule(
	table: BackgroundAttributes,
	cell: Record<string, unknown>
): 'header' | 'stripe' | undefined {
	const row = cell.row;
	const column = cell.column;
	if (
		!Number.isInteger(row) ||
		!Number.isInteger(column) ||
		Number(row) < 0 ||
		Number(row) > 99 ||
		Number(column) < 0 ||
		Number(column) > 49
	) {
		return undefined;
	}
	if (cellSemantics(table, cell).tag === 'th') {
		return 'header';
	}
	const headers = headerRowCount(table.headerRows);
	let index: number | undefined;
	if (table.stripeMode === 'rows') {
		index = Number(row) - headers;
	} else if (table.stripeMode === 'columns') {
		index = Number(column);
	}
	return index !== undefined && index % 2 === 1 ? 'stripe' : undefined;
}

export function backgroundMarkers(
	table: BackgroundAttributes,
	cell: Record<string, unknown> & NativeStyleAttributes
) {
	return {
		'data-mtb-bg': backgroundRule(table, cell),
		'data-mtb-bg-local': isValidToken(
			'cellBackgroundColor',
			cell.styleTokens?.cellBackgroundColor
		)
			? ''
			: undefined,
	};
}

/**
 * Parent value at this logical origin, excluding the cell's own override.
 * @param table
 * @param cell
 */
export function inheritedCellBackground(
	table: BackgroundAttributes,
	cell: Record<string, unknown>
): string | undefined {
	const rule = backgroundRule(table, cell);
	let key:
		| 'headerBackgroundColor'
		| 'stripeBackgroundColor'
		| 'cellBackgroundColor' = 'cellBackgroundColor';
	if (rule === 'header') {
		key = 'headerBackgroundColor';
	} else if (rule === 'stripe') {
		key = 'stripeBackgroundColor';
	}
	const value = table.styleTokens?.[key];
	if (isValidToken(key, value)) {
		return value;
	}
	const fallback = table.styleTokens?.cellBackgroundColor;
	return isValidToken('cellBackgroundColor', fallback) ? fallback : undefined;
}
