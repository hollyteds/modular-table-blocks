import { BulkError } from './errors';
import type { BlockTree } from '../grid/operations';
import { effectiveCellTag } from '../grid/cell-type';
import { sideKey, sideValues, sides, updateSides } from '../styles/sides';
import type { Side, SideKind } from '../styles/sides';
import { isValidToken } from '../styles/tokens';
import type { StyleTokens } from '../styles/tokens';
import { migrateStyleAttributes } from '../styles/native';
import type { NativeStyleAttributes } from '../styles/native';
import {
	isVerticalAlignment,
	verticalAlignment,
} from '../styles/vertical-alignment';
import { isHorizontalAlignment } from '../styles/horizontal-alignment';
import { inheritedCellBackground } from '../styles/background';
import {
	isTypographyField,
	typographyFields,
	validTypographyValue,
} from '../styles/typography';
import type { BulkField, BulkPatch } from './types';

type FieldPolicy = Readonly<{
	storage: 'cell' | 'inherited';
	clearable: boolean;
	normalization: 'none' | 'uniform' | 'background';
	token: boolean;
}>;

const inheritedToken: FieldPolicy = {
	storage: 'inherited',
	clearable: true,
	normalization: 'uniform',
	token: true,
};
const inheritedNative: FieldPolicy = { ...inheritedToken, token: false };
const background: FieldPolicy = {
	...inheritedToken,
	normalization: 'background',
};
const cellType: FieldPolicy = {
	storage: 'cell',
	clearable: false,
	normalization: 'none',
	token: false,
};

export function fieldPolicy(field: BulkField): FieldPolicy {
	if (
		isTypographyField(field) &&
		field !== 'fontSize' &&
		field !== 'lineHeight'
	) {
		return inheritedNative;
	}
	switch (field) {
		case 'tag':
			return cellType;
		case 'cellBackgroundColor':
			return background;
		case 'verticalAlign':
		case 'textAlign':
			return inheritedNative;
		default:
			return inheritedToken;
	}
}

export const boxKinds = [
	'borderWidth',
	'borderStyle',
	'borderColor',
	'padding',
] as const;
export const boxFields = (kind: SideKind): BulkField[] =>
	sides.map((side): BulkField => `${kind}.${side}`);
export const cellFields: BulkField[] = [
	'tag',
	'verticalAlign',
	'textAlign',
	'cellBackgroundColor',
	...typographyFields,
	...boxKinds.flatMap(boxFields),
];
export const owns = (patch: BulkPatch, key: BulkField) =>
	Object.prototype.hasOwnProperty.call(patch, key);

export function fieldValue(
	attributes: NativeStyleAttributes & { tag?: unknown },
	field: BulkField
): string | undefined {
	if (field === 'tag') {
		return attributes.tag === 'th' ? 'th' : 'td';
	}
	const attrs = migrateStyleAttributes(attributes);
	if (field === 'verticalAlign') {
		return verticalAlignment(attrs.verticalAlign);
	}
	if (field === 'textAlign') {
		const value = attrs.style?.typography?.textAlign;
		return isHorizontalAlignment(value) ? value : undefined;
	}
	if (field === 'fontSize') {
		return attrs.fontSize
			? `var(--wp--preset--font-size--${attrs.fontSize})`
			: attrs.style?.typography?.fontSize?.toString();
	}
	if (field === 'lineHeight') {
		return attrs.style?.typography?.lineHeight?.toString();
	}
	if (field === 'textColor') {
		return attrs.textColor
			? `var(--wp--preset--color--${attrs.textColor})`
			: (attrs.style?.color?.text as string | undefined);
	}
	if (field === 'fontFamily') {
		return attrs.fontFamily
			? `var(--wp--preset--font-family--${attrs.fontFamily})`
			: (attrs.style?.typography?.fontFamily as string | undefined);
	}
	if (isTypographyField(field)) {
		return attrs.style?.typography?.[field]?.toString();
	}
	if (field === 'cellBackgroundColor') {
		return attrs.styleTokens?.cellBackgroundColor;
	}
	const [kind, side] = field.split('.') as [SideKind, Side];
	return sideValues(attrs.styleTokens ?? {}, kind)[side];
}

export function commonValue(values: (string | undefined)[]) {
	const mixed = values.some((value) => value !== values[0]);
	return { mixed, value: mixed ? undefined : values[0] };
}

export function boxPatch(
	before: StyleTokens,
	after: StyleTokens,
	fields: BulkField[]
): BulkPatch {
	const patch: BulkPatch = {};
	for (const field of fields) {
		const value = fieldValue({ styleTokens: after }, field);
		if (value !== fieldValue({ styleTokens: before }, field)) {
			patch[field] = value;
		}
	}
	// Native BorderControl clears color/style when width becomes zero. Keep those
	// per-cell values so restoring a width later also restores the original line.
	for (const side of sides) {
		const width: BulkField = `borderWidth.${side}`;
		if (
			owns(patch, width) &&
			patch[width] !== undefined &&
			parseFloat(patch[width]!) === 0 &&
			sideValues(after, 'borderStyle')[side] === 'none' &&
			sideValues(after, 'borderColor')[side] === undefined
		) {
			delete patch[`borderStyle.${side}`];
			delete patch[`borderColor.${side}`];
		}
	}
	return patch;
}

export function validatePatch(patch: BulkPatch) {
	for (const [key, value] of Object.entries(patch)) {
		if (!cellFields.includes(key as BulkField)) {
			throw new BulkError('invalid-field');
		}
		if (value === undefined && !fieldPolicy(key as BulkField).clearable) {
			throw new BulkError('invalid-value');
		}
		if (key === 'tag') {
			if (value !== 'th' && value !== 'td') {
				throw new BulkError('invalid-value');
			}
			continue;
		}
		if (key === 'verticalAlign') {
			if (value !== undefined && !isVerticalAlignment(value)) {
				throw new BulkError('invalid-value');
			}
			continue;
		}
		if (key === 'textAlign') {
			if (value !== undefined && !isHorizontalAlignment(value)) {
				throw new BulkError('invalid-value');
			}
			continue;
		}
		if (isTypographyField(key)) {
			if (value !== undefined && !validTypographyValue(key, value)) {
				throw new BulkError('invalid-value');
			}
			continue;
		}
		const [kind, side] = key.split('.') as [SideKind, Side];
		const token = side
			? sideKey(kind, side)
			: (key as 'fontSize' | 'lineHeight' | 'cellBackgroundColor');
		if (value !== undefined && !isValidToken(token, value)) {
			throw new BulkError('invalid-value');
		}
	}
}

export function patchAttributes(
	original: Record<string, unknown>,
	patch: BulkPatch
) {
	let tokens = {
		...(original as NativeStyleAttributes).styleTokens,
	};
	const attributes: Record<string, unknown> = {};
	let changedTokens = false;
	for (const field of cellFields) {
		if (!owns(patch, field)) {
			continue;
		}
		const value = patch[field];
		if (field === 'tag') {
			attributes.tag = value;
			if (value === 'td') {
				attributes.scope = '';
			}
		} else if (field === 'verticalAlign') {
			attributes.verticalAlign = value;
		} else if (isTypographyField(field) || field === 'textAlign') {
			const native = migrateStyleAttributes(
				original as NativeStyleAttributes
			);
			const style = {
				...native.style,
				...(attributes.style as NativeStyleAttributes['style']),
			};
			if (field === 'textColor') {
				const color = { ...style.color };
				delete color.text;
				const preset =
					value &&
					/^var\(--wp--preset--color--([a-z0-9-]+)\)$/.exec(value);
				attributes.textColor = preset ? preset[1] : undefined;
				if (value !== undefined && !preset) {
					color.text = value;
				}
				attributes.style = { ...style, color };
				delete tokens.textColor;
				changedTokens = true;
				continue;
			}
			const typography = { ...style.typography };
			delete typography[field];
			const preset =
				(field === 'fontSize' || field === 'fontFamily') && value
					? /^var\(--wp--preset--(?:font-size|font-family)--([a-z0-9-]+)\)$/.exec(
							value
						)
					: undefined;
			if (value !== undefined && !preset) {
				typography[field] = value;
			}
			if (field === 'fontSize' || field === 'fontFamily') {
				attributes[field] = preset ? preset[1] : undefined;
			}
			attributes.style = { ...style, typography };
			if (field === 'textAlign') {
				if (
					Object.prototype.hasOwnProperty.call(
						original,
						'horizontalAlign'
					)
				) {
					attributes.horizontalAlign = undefined;
				}
			} else if (field === 'fontSize' || field === 'lineHeight') {
				delete tokens[field];
				changedTokens = true;
			}
		} else if (field === 'cellBackgroundColor') {
			delete tokens.cellBackgroundColor;
			if (value !== undefined) {
				tokens.cellBackgroundColor = value;
			}
			changedTokens = true;
		} else {
			const [kind, side] = field.split('.') as [SideKind, Side];
			tokens = updateSides(tokens, kind, [side], value);
			changedTokens = true;
		}
	}
	if (changedTokens) {
		attributes.styleTokens = tokens;
	}
	return attributes;
}

export function localFieldValue(
	attributes: NativeStyleAttributes,
	field: BulkField
): string | undefined {
	if (field !== 'verticalAlign') {
		return fieldValue(attributes, field);
	}
	return isVerticalAlignment(attributes.verticalAlign)
		? attributes.verticalAlign
		: undefined;
}

export function resolvedFieldValue(
	table: BlockTree,
	attributes: NativeStyleAttributes & { tag?: unknown; row?: unknown },
	field: BulkField
): string | undefined {
	if (field === 'tag') {
		return effectiveCellTag(table.attributes, attributes);
	}
	if (field === 'cellBackgroundColor') {
		return (
			localFieldValue(attributes, field) ??
			inheritedCellBackground(table.attributes, attributes)
		);
	}
	return (
		localFieldValue(attributes, field) ??
		localFieldValue(table.attributes, field) ??
		(field === 'verticalAlign' ? 'top' : undefined)
	);
}
