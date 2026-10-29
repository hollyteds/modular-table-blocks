export type BorderCollapse = 'collapse' | 'separate';

export function isBorderCollapse(value: unknown): value is BorderCollapse {
	return value === 'collapse' || value === 'separate';
}
