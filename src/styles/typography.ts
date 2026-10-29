import { isValidToken } from './tokens';

export const typographyFields = [
	'textColor',
	'fontFamily',
	'fontSize',
	'fontStyle',
	'fontWeight',
	'lineHeight',
	'letterSpacing',
	'textDecoration',
	'textTransform',
	'writingMode',
] as const;
export type TypographyField = (typeof typographyFields)[number];

export const isTypographyField = (field: string): field is TypographyField =>
	typographyFields.includes(field as TypographyField);

// Keep the additional native values aligned with PHP's valid_typography_value.
export function validTypographyValue(
	field: TypographyField,
	value: string
): boolean {
	if (!value || value.length > 1000) {
		return false;
	}
	if (field === 'textColor') {
		return isValidToken(field, value);
	}
	if (field === 'fontSize') {
		if (
			/^var\(--wp--preset--font-size--[a-z0-9]+(?:-[a-z0-9]+)*\)$/.test(
				value
			)
		) {
			return true;
		}
		return (
			/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh)$/.test(value) &&
			Number.isFinite(parseFloat(value)) &&
			parseFloat(value) > 0
		);
	}
	if (field === 'lineHeight') {
		return (
			value === 'normal' ||
			(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) &&
				Number.isFinite(Number(value)))
		);
	}
	if (field === 'fontFamily') {
		return /^(?:var\(--wp--preset--font-family--[a-z0-9]+(?:-[a-z0-9]+)*\)|[\p{L}\p{N}\s,'"_ -]+)$/u.test(
			value
		);
	}
	if (field === 'fontWeight') {
		return (
			/^(normal|bold|bolder|lighter)$/.test(value) ||
			(/^\d+(?:\.\d+)?$/.test(value) &&
				Number(value) >= 1 &&
				Number(value) <= 1000)
		);
	}
	if (field === 'letterSpacing') {
		return (
			value === 'normal' ||
			value === '0' ||
			/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%|vw|vh)$/.test(value)
		);
	}
	const keywords = {
		fontStyle: ['normal', 'italic', 'oblique'],
		textDecoration: ['none', 'underline', 'line-through', 'overline'],
		textTransform: [
			'none',
			'capitalize',
			'uppercase',
			'lowercase',
			'full-width',
			'full-size-kana',
		],
		writingMode: ['horizontal-tb', 'vertical-rl', 'vertical-lr'],
	};
	return keywords[field].includes(value);
}
