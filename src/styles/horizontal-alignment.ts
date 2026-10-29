export type HorizontalAlignment = 'left' | 'center' | 'right';

export function isHorizontalAlignment(
	value: unknown
): value is HorizontalAlignment {
	return value === 'left' || value === 'center' || value === 'right';
}
