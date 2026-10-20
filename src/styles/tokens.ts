import type { CSSProperties } from 'react';

export const tokenNames = {
	textColor: '--mtb-text-color',
	backgroundColor: '--mtb-background-color',
	cellBackgroundColor: '--mtb-cell-background-color',
	borderColor: '--mtb-border-color',
	borderWidth: '--mtb-border-width',
	borderStyle: '--mtb-border-style',
	cellPaddingBlock: '--mtb-cell-padding-block',
	cellPaddingInline: '--mtb-cell-padding-inline',
	fontSize: '--mtb-font-size',
	lineHeight: '--mtb-line-height',
	tableWidth: '--mtb-table-width',
} as const;

export type TokenKey = keyof typeof tokenNames;
export type StyleTokens = Partial<Record<TokenKey, string>>;

// Accept a narrow CSS grammar. Arbitrary CSS, URLs and expressions are rejected.
export function isValidToken(key: TokenKey, value: unknown): value is string {
	if (
		typeof value !== 'string' ||
		value.length > 100 ||
		/[\r\n]/.test(value)
	) {
		return false;
	}
	let preset = '';
	if (key.endsWith('Color')) {
		preset = 'color';
	} else if (key === 'fontSize') {
		preset = 'font-size';
	} else if (key.startsWith('cellPadding')) {
		preset = 'spacing';
	}
	if (
		preset &&
		new RegExp(
			`^var\\(--wp--preset--${preset}--[a-z0-9]+(?:-[a-z0-9]+)*\\)$`
		).test(value)
	) {
		return true;
	}
	if (key.endsWith('Color')) {
		return /^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent|currentColor|inherit)$/i.test(
			value
		);
	}
	if (key === 'borderStyle') {
		return ['none', 'solid', 'dashed', 'dotted', 'double'].includes(value);
	}
	if (key === 'lineHeight') {
		return (
			value === 'normal' ||
			(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) &&
				Number(value) >= 0.5 &&
				Number(value) <= 4)
		);
	}
	if (value === '0' && key !== 'fontSize' && key !== 'tableWidth') {
		return true;
	}
	const length = /^(\d+(?:\.\d+)?|\.\d+)(px|rem|em|%)$/.exec(value);
	if (!length) {
		return false;
	}
	const amount = Number(length[1]);
	const unit = length[2];
	if (key === 'tableWidth') {
		const max = { '%': 100, px: 4000, em: 250, rem: 250 };
		return amount > 0 && amount <= max[unit as keyof typeof max];
	}
	if (key === 'fontSize') {
		const bounds = {
			px: [8, 160],
			'%': [50, 500],
			em: [0.5, 10],
			rem: [0.5, 10],
		};
		const [min, max] = bounds[unit as keyof typeof bounds];
		return amount >= min && amount <= max;
	}
	const max =
		key === 'borderWidth'
			? { px: 20, em: 1, rem: 1 }
			: { px: 200, em: 10, rem: 10 };
	return (
		unit !== '%' && amount >= 0 && amount <= max[unit as keyof typeof max]
	);
}

export function tokenStyle(tokens: unknown): CSSProperties {
	const style: Record<string, string> = {};
	if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
		for (const key of Object.keys(tokenNames) as TokenKey[]) {
			const value = (tokens as Record<string, unknown>)[key];
			if (isValidToken(key, value)) {
				style[tokenNames[key]] = value;
			}
		}
	}
	return style;
}
