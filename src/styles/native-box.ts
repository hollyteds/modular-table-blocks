import { sideKey, sideValues, sides, updateSides } from './sides';
import type { Side, SideKind, SideValues } from './sides';
import type { StyleTokens } from './tokens';
import { isValidToken } from './tokens';
import type { Preset } from './controls';

export type Border = {
	width?: string | number;
	style?: string;
	color?: string;
};
export type BorderValue = Border | Partial<Record<Side, Border | undefined>>;
const borderFields = {
	width: 'borderWidth',
	style: 'borderStyle',
	color: 'borderColor',
} as const;

export function resetBoxTokens(tokens: StyleTokens, border: boolean) {
	let next = tokens;
	for (const kind of border
		? Object.values(borderFields)
		: (['padding'] as const)) {
		next = updateSides(next, kind, sides);
	}
	return next;
}

export function paddingControlValue(tokens: StyleTokens): SideValues {
	return Object.fromEntries(
		Object.entries(sideValues(tokens, 'padding')).map(([side, value]) => [
			side,
			value.replace(
				/^var\(--wp--preset--spacing--([a-z0-9-]+)\)$/,
				'var:preset|spacing|$1'
			),
		])
	);
}

function checkedUpdate(
	tokens: StyleTokens,
	kind: SideKind,
	side: Side,
	value?: string
) {
	if (value !== undefined && !isValidToken(sideKey(kind, side), value)) {
		throw new Error('Unsupported box style value');
	}
	return sideValues(tokens, kind)[side] === value
		? tokens
		: updateSides(tokens, kind, [side], value);
}

export function applyPaddingValue(tokens: StyleTokens, values: SideValues) {
	let next = tokens;
	for (const side of sides) {
		const value = values[side]?.replace(
			/^var:preset\|spacing\|([a-z0-9-]+)$/,
			'var(--wp--preset--spacing--$1)'
		);
		next = checkedUpdate(next, 'padding', side, value || undefined);
	}
	return next;
}

export function borderControlValue(
	tokens: StyleTokens,
	presets: Preset[]
): BorderValue {
	const values: Partial<Record<Side, Border>> = {};
	for (const side of sides) {
		const border: Border = {};
		for (const [field, kind] of Object.entries(borderFields)) {
			const value = sideValues(tokens, kind)[side];
			if (value !== undefined) {
				border[field as keyof Border] =
					field === 'color'
						? (presets.find((preset) => preset.value === value)
								?.color ?? value)
						: value;
			}
		}
		values[side] = border;
	}
	return sides.every(
		(side) => JSON.stringify(values[side]) === JSON.stringify(values.top)
	)
		? (values.top ?? {})
		: values;
}

export function applyBorderValue(
	tokens: StyleTokens,
	value: BorderValue | undefined,
	presets: Preset[]
) {
	const split = value && sides.some((side) => side in value);
	let next = tokens;
	for (const side of sides) {
		const border = split
			? (value as Partial<Record<Side, Border>>)[side]
			: (value as Border | undefined);
		for (const [field, kind] of Object.entries(borderFields)) {
			const raw = border?.[field as keyof Border];
			let saved =
				raw === undefined || raw === '' ? undefined : String(raw);
			if (field === 'color' && saved !== undefined) {
				const previous = sideValues(tokens, kind)[side];
				const displayed =
					presets.find((preset) => preset.value === previous)
						?.color ?? previous;
				// A width/style edit must not turn an existing custom color into a preset.
				saved =
					displayed?.toLowerCase() === saved.toLowerCase()
						? previous
						: (presets.find(
								(preset) =>
									preset.color?.toLowerCase() ===
									saved?.toLowerCase()
							)?.value ?? saved);
			}
			next = checkedUpdate(next, kind, side, saved);
		}
	}
	return next;
}
