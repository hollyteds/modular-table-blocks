import { isValidToken } from './tokens';

export function validColumnWidth(value: unknown): value is string {
	return isValidToken('tableWidth', value);
}

export function columnTemplate(columns: unknown): string {
	if (!Array.isArray(columns) || columns.length < 1 || columns.length > 50) {
		return 'repeat(3, minmax(8rem, 1fr))';
	}
	return columns
		.map((column: unknown) => {
			const width =
				column && typeof column === 'object' && 'width' in column
					? column.width
					: undefined;
			return `minmax(8rem, ${validColumnWidth(width) ? width : '1fr'})`;
		})
		.join(' ');
}
