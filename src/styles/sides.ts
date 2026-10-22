import type { StyleTokens, TokenKey } from './tokens';

export const sides = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof sides)[number];
export type SideValues = Partial<Record<Side, string>>;
export type SideKind =
	'padding' | 'borderWidth' | 'borderColor' | 'borderStyle';
export type DirectionMode = 'all' | 'axes' | 'sides';

export function sideKey(kind: SideKind, side: Side): TokenKey {
	const name = side[0].toUpperCase() + side.slice(1);
	return (
		kind === 'padding'
			? `cellPadding${name}`
			: `border${name}${kind.slice(6)}`
	) as TokenKey;
}

export function sideValues(tokens: StyleTokens, kind: SideKind): SideValues {
	const values: SideValues = {};
	for (const side of sides) {
		const fallback =
			kind === 'padding'
				? tokens[
						side === 'top' || side === 'bottom'
							? 'cellPaddingBlock'
							: 'cellPaddingInline'
					]
				: tokens[kind];
		const value = tokens[sideKey(kind, side)] ?? fallback;
		if (value !== undefined) {
			values[side] = value;
		}
	}
	return values;
}

export function directionMode(values: SideValues): DirectionMode {
	if (sides.every((side) => values[side] === values.top)) {
		return 'all';
	}
	return values.top === values.bottom && values.left === values.right
		? 'axes'
		: 'sides';
}

// Expanding only local shorthands preserves unrelated sides and parent inheritance.
export function updateSides(
	tokens: StyleTokens,
	kind: SideKind,
	selected: readonly Side[],
	value?: string
): StyleTokens {
	const next = { ...tokens };
	const values = sideValues(tokens, kind);
	if (kind === 'padding') {
		delete next.cellPaddingBlock;
		delete next.cellPaddingInline;
	} else {
		delete next[kind];
	}
	for (const side of selected) {
		if (value === undefined) {
			delete values[side];
		} else {
			values[side] = value;
		}
	}
	for (const side of sides) {
		const key = sideKey(kind, side);
		if (values[side] === undefined) {
			delete next[key];
		} else {
			next[key] = values[side];
		}
	}
	return next;
}
