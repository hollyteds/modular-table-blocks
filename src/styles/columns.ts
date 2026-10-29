import { isValidToken } from './tokens';

export type ColumnWidthMode = 'equal' | 'auto' | 'custom';

export function columnWidthMode(attributes: {
	columns?: unknown;
	columnWidthMode?: unknown;
}): ColumnWidthMode {
	const mode = attributes.columnWidthMode;
	if (mode === 'equal' || mode === 'auto' || mode === 'custom') {
		return mode;
	}
	return Array.isArray(attributes.columns) &&
		attributes.columns.some((column) => validColumnWidth(column?.width))
		? 'custom'
		: 'equal';
}

export function validColumnWidth(value: unknown): value is string {
	return isValidToken('tableWidth', value);
}

export function columnTemplate(
	columns: unknown,
	requestedMode?: unknown
): string {
	if (!Array.isArray(columns) || columns.length < 1 || columns.length > 50) {
		return columnTemplate([{}, {}, {}], requestedMode);
	}
	const mode = columnWidthMode({ columns, columnWidthMode: requestedMode });
	if (mode === 'equal') {
		return `repeat(${columns.length}, minmax(var(--mtb-editor-column-min-width, 0px), 1fr))`;
	}
	// Share intrinsic widths across the shared grid; keep the editing minimum.
	const minimum = `var(--mtb-editor-column-min-width, min(8rem, max(0px, calc((100% - ${columns.length - 1} * var(--mtb-editor-column-gap, 0px)) / ${columns.length}))))`;
	return columns
		.map((column: unknown) => {
			const width =
				mode === 'custom' &&
				column &&
				typeof column === 'object' &&
				'width' in column
					? column.width
					: undefined;
			const adjusted =
				validColumnWidth(width) && width.endsWith('%')
					? `max(0px, calc(${width} - ${(Number.parseFloat(width) / 100) * (columns.length - 1)} * var(--mtb-editor-column-gap, 0px)))`
					: width;
			return validColumnWidth(width)
				? `minmax(min(${minimum}, ${adjusted}), ${adjusted})`
				: `minmax(${minimum}, auto)`;
		})
		.join(' ');
}
