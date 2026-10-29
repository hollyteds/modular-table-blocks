import { isHorizontalAlignment } from './horizontal-alignment';
import type { HorizontalAlignment } from './horizontal-alignment';
import { isVerticalAlignment } from './vertical-alignment';
import type { VerticalAlignment } from './vertical-alignment';

export type MatrixAlignment =
	`${'top' | 'center' | 'bottom'} ${HorizontalAlignment}`;

export function matrixAlignment(
	vertical: unknown,
	horizontal: unknown
): MatrixAlignment | undefined {
	return isVerticalAlignment(vertical) && isHorizontalAlignment(horizontal)
		? `${vertical === 'middle' ? 'center' : vertical} ${horizontal}`
		: undefined;
}

export function normalizeMatrixAlignment(
	value: unknown
): MatrixAlignment | undefined {
	if (value === 'center') {
		return 'center center';
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const [vertical, horizontal] = value.split(' ');
	return ['top', 'center', 'bottom'].includes(vertical) &&
		isHorizontalAlignment(horizontal) &&
		value === `${vertical} ${horizontal}`
		? (value as MatrixAlignment)
		: undefined;
}

export function alignmentPatch(value?: MatrixAlignment): {
	verticalAlign: VerticalAlignment | undefined;
	textAlign: HorizontalAlignment | undefined;
} {
	if (!value) {
		return { verticalAlign: undefined, textAlign: undefined };
	}
	const [vertical, horizontal] = value.split(' ');
	return {
		verticalAlign: (vertical === 'center'
			? 'middle'
			: vertical) as VerticalAlignment,
		textAlign: horizontal as HorizontalAlignment,
	};
}

export function matrixPosition(index: number): MatrixAlignment | undefined {
	if (!Number.isInteger(index) || index < 0 || index >= 9) {
		return undefined;
	}
	return `${(['top', 'center', 'bottom'] as const)[Math.floor(index / 3)]} ${(['left', 'center', 'right'] as const)[index % 3]}`;
}
