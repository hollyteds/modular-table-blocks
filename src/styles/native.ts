import type { CSSProperties } from 'react';
import { isValidToken, tokenStyle } from './tokens';
import { isVerticalAlignment } from './vertical-alignment';
import type { StyleTokens } from './tokens';

export type NativeStyleAttributes = {
	verticalAlign?: unknown;
	styleTokens?: StyleTokens;
	fontSize?: string;
	textColor?: string;
	backgroundColor?: string;
	fontFamily?: string;
	style?: {
		typography?: Record<string, unknown>;
		color?: Record<string, unknown>;
		dimensions?: { minHeight?: string };
		[key: string]: unknown;
	};
	horizontalAlign?: string;
};

const migrated = [
	'fontSize',
	'lineHeight',
	'textColor',
	'backgroundColor',
] as const;

export function hasExplicitFontWeight(
	attributes: NativeStyleAttributes
): boolean {
	const weight = attributes.style?.typography?.fontWeight;
	return (
		(typeof weight === 'string' &&
			/^(normal|bold|bolder|lighter)$/.test(weight)) ||
		(((typeof weight === 'string' && /^\d+(?:\.\d+)?$/.test(weight)) ||
			typeof weight === 'number') &&
			Number.isFinite(Number(weight)) &&
			Number(weight) >= 1 &&
			Number(weight) <= 1000)
	);
}

/**
 * Upgrade parsed attributes without effects, extra undo levels or DOM mutations.
 * @param attributes
 */
export function migrateStyleAttributes<T extends NativeStyleAttributes>(
	attributes: T
): T {
	const tokens = { ...attributes.styleTokens };
	const next = { ...attributes, style: { ...attributes.style } };
	let changed = false;
	for (const key of migrated) {
		const value = tokens[key];
		if (!isValidToken(key, value)) {
			continue;
		}
		const group = key.endsWith('Color') ? 'color' : 'typography';
		const properties = {
			textColor: 'text',
			backgroundColor: 'background',
			fontSize: 'fontSize',
			lineHeight: 'lineHeight',
		};
		const property = properties[key];
		const preset =
			/^var\(--wp--preset--(?:font-size|color)--([a-z0-9-]+)\)$/.exec(
				value
			);
		const nativePreset = key === 'lineHeight' ? undefined : next[key];
		if (
			nativePreset === undefined &&
			next.style[group]?.[property] === undefined
		) {
			if (preset && key !== 'lineHeight') {
				next[key] = preset[1];
			} else {
				next.style[group] = { ...next.style[group], [property]: value };
			}
		}
		delete tokens[key];
		changed = true;
	}
	if (
		attributes.horizontalAlign &&
		['left', 'center', 'right'].includes(attributes.horizontalAlign)
	) {
		next.style.typography = {
			textAlign: attributes.horizontalAlign,
			...next.style.typography,
		};
		delete next.horizontalAlign;
		changed = true;
	}
	return changed ? { ...next, styleTokens: tokens } : attributes;
}

/**
 * Legacy posts also render before their next editor save. Native values win.
 * @param attributes
 */
export function editorStyle(attributes: NativeStyleAttributes): CSSProperties {
	const tokens = { ...attributes.styleTokens };
	for (const key of migrated) {
		delete tokens[key];
	}
	const style: CSSProperties = tokenStyle(tokens);
	if (isVerticalAlignment(attributes.verticalAlign)) {
		const alignment = {
			top: 'start',
			middle: 'center',
			bottom: 'end',
		} as const;
		Object.assign(style, {
			'--mtb-cell-vertical-align': attributes.verticalAlign,
			'--mtb-cell-align-content': alignment[attributes.verticalAlign],
		});
	}
	const upgrade = migrateStyleAttributes(attributes);
	// A native family preset is a class in the editor. Protect it from the
	// scoped baseline while keeping the standard attribute as the source.
	if (
		typeof upgrade.fontFamily === 'string' &&
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(upgrade.fontFamily)
	) {
		style.fontFamily = `var(--wp--preset--font-family--${upgrade.fontFamily})`;
	}
	const background = upgrade.backgroundColor
		? `var(--wp--preset--color--${upgrade.backgroundColor})`
		: upgrade.style?.color?.background;
	if (typeof background === 'string') {
		// The plugin's table fallback must not mask native preset classes.
		style.backgroundColor = background;
		Object.assign(style, { '--mtb-background-color': 'initial' });
	}
	const color = upgrade.textColor
		? `var(--wp--preset--color--${upgrade.textColor})`
		: upgrade.style?.color?.text;
	const size = upgrade.fontSize
		? `var(--wp--preset--font-size--${upgrade.fontSize})`
		: upgrade.style?.typography?.fontSize;
	if (typeof color === 'string') {
		if (
			attributes.textColor === undefined &&
			attributes.style?.color?.text === undefined
		) {
			style.color = color;
		}
		Object.assign(style, { '--mtb-text-color': 'initial' });
	}
	if (typeof size === 'string' || typeof size === 'number') {
		if (
			attributes.fontSize === undefined &&
			attributes.style?.typography?.fontSize === undefined
		) {
			style.fontSize = size;
		}
		Object.assign(style, { '--mtb-font-size': 'initial' });
	}
	const height = upgrade.style?.typography?.lineHeight;
	if (typeof height === 'string' || typeof height === 'number') {
		if (attributes.style?.typography?.lineHeight === undefined) {
			style.lineHeight = height;
		}
		Object.assign(style, { '--mtb-line-height': 'initial' });
	}
	const align = upgrade.style?.typography?.textAlign;
	if (align === 'left' || align === 'right' || align === 'center') {
		style.textAlign = align;
	}
	return style;
}
