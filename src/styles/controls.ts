import { isValidToken } from './tokens';
import type { TokenKey } from './tokens';

export type LengthKind =
	| 'borderWidth'
	| 'cellPaddingBlock'
	| 'cellPaddingInline'
	| 'fontSize'
	| 'borderSpacingHorizontal'
	| 'borderSpacingVertical'
	| 'tableWidth';
export type Unit = 'px' | 'em' | 'rem' | '%';
export type Preset = { name: string; value: string; color?: string };

export function lengthValue(value: string) {
	if (value === '0') {
		return { amount: 0, unit: 'px' as Unit };
	}
	const match = /^(\d+(?:\.\d+)?|\.\d+)(px|em|rem|%)$/.exec(value);
	return match
		? { amount: Number(match[1]), unit: match[2] as Unit }
		: undefined;
}

export function lengthBounds(kind: LengthKind, unit: Unit) {
	const relative = unit === 'em' || unit === 'rem';
	if (kind === 'fontSize') {
		if (relative) {
			return { min: 0.5, max: 10, step: 0.05 };
		}
		return unit === '%'
			? { min: 50, max: 500, step: 1 }
			: { min: 8, max: 160, step: 1 };
	}
	if (kind === 'tableWidth') {
		return {
			min: 0.01,
			max: { px: 4000, '%': 100, em: 250, rem: 250 }[unit],
			step: 0.01,
		};
	}
	const max =
		kind === 'borderWidth'
			? { px: 20, '%': 20, em: 1, rem: 1 }
			: { px: 200, '%': 200, em: 10, rem: 10 };
	return { min: 0, max: max[unit], step: relative ? 0.05 : 1 };
}

export function themePresets(input: unknown, key: TokenKey): Preset[] {
	let entries: unknown[] = [];
	if (Array.isArray(input)) {
		entries = input;
	} else if (input && typeof input === 'object') {
		entries = Object.values(input).flatMap((group) =>
			Array.isArray(group) ? group : []
		);
	}
	let category = 'spacing';
	if (key.endsWith('Color')) {
		category = 'color';
	} else if (key === 'fontSize') {
		category = 'font-size';
	}
	return entries.flatMap((candidate) => {
		if (!candidate || typeof candidate !== 'object') {
			return [];
		}
		const entry = candidate as Record<string, unknown>;
		if (typeof entry.slug !== 'string' || typeof entry.name !== 'string') {
			return [];
		}
		const value = `var(--wp--preset--${category}--${entry.slug})`;
		if (!isValidToken(key, value)) {
			return [];
		}
		if (
			category === 'color' &&
			(typeof entry.color !== 'string' ||
				!entry.color.trim() ||
				/[;{}\r\n]/.test(entry.color) ||
				/(?:url|expression)\s*\(/i.test(entry.color))
		) {
			return [];
		}
		// Theme display colors may use rgb(), color-mix() or CSS variables.
		// Only the validated preset reference above is ever persisted.
		return [
			{
				name: entry.name,
				value,
				...(category === 'color'
					? { color: entry.color as string }
					: {}),
			},
		];
	});
}

type ColorSettings = {
	theme?: unknown;
	custom?: unknown;
	defaults?: unknown;
	defaultPalette?: unknown;
};

export function colorPresetSettings(
	settings: ColorSettings,
	legacy: unknown,
	key: TokenKey
) {
	const { theme, custom, defaults, defaultPalette } = settings;
	const structured = [theme, custom, defaults].some(Array.isArray);
	const sources = structured
		? [
				{ origin: 'custom', input: custom },
				{ origin: 'theme', input: theme },
				{
					origin: 'default',
					input: defaultPalette === false ? [] : defaults,
				},
			]
		: [{ origin: 'legacy', input: legacy }];
	const seen = new Set<string>();
	// Resolve overrides before arranging the palettes in the native display order.
	const resolved = sources.map(({ origin, input }) => ({
		origin,
		presets: themePresets(input, key).filter((preset) => {
			if (seen.has(preset.value)) {
				return false;
			}
			seen.add(preset.value);
			return true;
		}),
	}));
	return {
		presets: resolved.flatMap((group) => group.presets),
		groups: (['theme', 'default', 'custom'] as const).flatMap((origin) => {
			const group = resolved.find((entry) => entry.origin === origin);
			return group?.presets.length
				? [{ origin, presets: group.presets }]
				: [];
		}),
	};
}

export function colorPresets(
	settings: ColorSettings,
	legacy: unknown,
	key: TokenKey
): Preset[] {
	return colorPresetSettings(settings, legacy, key).presets;
}
