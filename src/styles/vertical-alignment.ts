export type VerticalAlignment = 'top' | 'middle' | 'bottom';

export function isVerticalAlignment(
	value: unknown
): value is VerticalAlignment {
	return value === 'top' || value === 'middle' || value === 'bottom';
}

export function verticalAlignment(value: unknown): VerticalAlignment {
	return isVerticalAlignment(value) ? value : 'top';
}
