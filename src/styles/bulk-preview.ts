import type { CSSProperties } from 'react';
import type { BlockTree } from '../grid/operations';
import { effectiveCellTag } from '../grid/cell-type';
import { migrateStyleAttributes } from './native';
import type { NativeStyleAttributes } from './native';
import type { BulkPatch } from './bulk';
import { sideKey } from './sides';
import type { Side, SideKind } from './sides';
import { tokenNames, tokenStyle } from './tokens';
import { isTypographyField } from './typography';

const typographyProperties = [
	'fontFamily',
	'fontWeight',
	'fontStyle',
	'letterSpacing',
	'textDecoration',
	'textTransform',
	'writingMode',
] as const;

export type PreviewEnvironment = {
	table: CSSProperties;
	parent?: CSSProperties;
	blocks: Record<string, CSSProperties>;
	fontSizes: Record<string, string>;
};

/**
 * Resolve the theme context from the editor iframe without changing its DOM.
 * @param root
 * @param table
 */
export function capturePreviewEnvironment(
	root: HTMLElement | null,
	table: BlockTree
): PreviewEnvironment {
	const environment: PreviewEnvironment = {
		table: {},
		blocks: {},
		fontSizes: {},
	};
	const view = root?.ownerDocument.defaultView;
	if (!root || !view) {
		return environment;
	}
	const computed = view.getComputedStyle(root);
	const tableStyle: Record<string, string> = {};
	for (const property of Array.from(computed)) {
		if (
			property.startsWith('--mtb-') ||
			property.startsWith('--wp--preset--')
		) {
			const value = computed.getPropertyValue(property).trim();
			if (value) {
				tableStyle[property] = value;
			}
		}
	}
	Object.assign(tableStyle, {
		color: computed.color,
		fontFamily: computed.fontFamily,
		fontSize: computed.fontSize,
		lineHeight: computed.lineHeight,
		fontWeight: computed.fontWeight,
		textAlign: computed.textAlign,
	});
	for (const property of typographyProperties) {
		tableStyle[property] = computed[property];
	}
	const parentComputed = root.parentElement
		? view.getComputedStyle(root.parentElement)
		: computed;
	const parentStyle: Record<string, string> = {};
	for (const key of Object.keys(tableStyle)) {
		parentStyle[key] = key.startsWith('--')
			? parentComputed.getPropertyValue(key).trim()
			: (parentComputed[key as keyof CSSStyleDeclaration] as string);
	}
	environment.parent = parentStyle;
	environment.table = tableStyle;
	const elements = new Map(
		Array.from(root.querySelectorAll<HTMLElement>('[data-block]')).map(
			(node) => [node.dataset.block, node]
		)
	);
	const capture = (block: BlockTree, parent: CSSStyleDeclaration) => {
		const element = elements.get(block.clientId);
		if (!element) {
			return parent;
		}
		const style = view.getComputedStyle(element);
		const own = previewStyle(block.attributes) as Record<string, unknown>;
		const external: Record<string, string> = {};
		for (const property of Object.values(tokenNames)) {
			const value = style.getPropertyValue(property).trim();
			if (
				!(property in own) &&
				value &&
				value !== parent.getPropertyValue(property).trim()
			) {
				external[property] = value;
			}
		}
		for (const property of [
			'color',
			'fontSize',
			'lineHeight',
			'fontWeight',
			'fontFamily',
			'textAlign',
			...typographyProperties,
		] as const) {
			// Header weight is derived from type, so it must follow TH/TD drafts.
			if (
				property === 'fontWeight' &&
				style.fontWeight === '700' &&
				effectiveCellTag(table.attributes, block.attributes) === 'th' &&
				parent.fontWeight !== '700' &&
				!(property in own)
			) {
				continue;
			}
			if (
				property === 'lineHeight' &&
				style.fontSize !== parent.fontSize
			) {
				continue;
			}
			if (!(property in own) && style[property] !== parent[property]) {
				external[property] = style[property];
			}
		}
		environment.blocks[block.clientId] = external;
		environment.fontSizes[block.clientId] = style.fontSize;
		return style;
	};
	for (const cell of table.innerBlocks) {
		capture(cell, computed);
	}
	return environment;
}

/**
 * Use the same local tokens and native typography on semantic preview elements.
 * @param attributes
 */
export function previewStyle(
	attributes: NativeStyleAttributes & { verticalAlign?: unknown }
): CSSProperties {
	const native = migrateStyleAttributes(attributes);
	const style: CSSProperties = tokenStyle(native.styleTokens);
	const typography = native.style?.typography;
	const background = native.backgroundColor
		? `var(--wp--preset--color--${native.backgroundColor})`
		: native.style?.color?.background;
	if (typeof background === 'string') {
		Object.assign(style, {
			backgroundColor: background,
			'--mtb-background-color': 'initial',
		});
	}
	for (const property of typographyProperties) {
		const value = typography?.[property];
		if (typeof value === 'string' || typeof value === 'number') {
			Object.assign(style, { [property]: value });
		}
	}
	if (native.fontFamily) {
		style.fontFamily = `var(--wp--preset--font-family--${native.fontFamily})`;
	}
	const color = native.textColor
		? `var(--wp--preset--color--${native.textColor})`
		: native.style?.color?.text;
	const size = native.fontSize
		? `var(--wp--preset--font-size--${native.fontSize})`
		: typography?.fontSize;
	if (typeof color === 'string') {
		Object.assign(style, { color, '--mtb-text-color': 'initial' });
	}
	if (typeof size === 'string' || typeof size === 'number') {
		Object.assign(style, { fontSize: size, '--mtb-font-size': 'initial' });
	}
	if (
		typeof typography?.lineHeight === 'string' ||
		typeof typography?.lineHeight === 'number'
	) {
		Object.assign(style, {
			lineHeight: typography.lineHeight,
			'--mtb-line-height': 'initial',
		});
	}
	if (
		typeof typography?.textAlign === 'string' &&
		['left', 'center', 'right', 'justify', 'start', 'end'].includes(
			typography.textAlign
		)
	) {
		style.textAlign = typography.textAlign as CSSProperties['textAlign'];
	}
	if (
		['top', 'middle', 'bottom'].includes(String(attributes.verticalAlign))
	) {
		style.verticalAlign = attributes.verticalAlign as string;
		Object.assign(style, {
			'--mtb-cell-vertical-align': attributes.verticalAlign,
		});
	}
	return style;
}

/**
 * Replace captured old table values with the parent context for edited fields.
 * @param environment
 * @param patch
 */
export function previewTableContext(
	environment: PreviewEnvironment,
	patch: BulkPatch
): CSSProperties {
	const style = { ...environment.table } as Record<string, unknown>;
	const parent = (environment.parent ?? {}) as Record<string, unknown>;
	for (const field of Object.keys(patch)) {
		if (field === 'tag') {
			continue;
		}
		let properties: string[];
		if (field === 'fontSize') {
			properties = ['fontSize', '--mtb-font-size'];
		} else if (field === 'lineHeight') {
			properties = ['lineHeight', '--mtb-line-height'];
		} else if (field === 'textColor') {
			properties = ['color', '--mtb-text-color'];
		} else if (isTypographyField(field)) {
			properties = [field];
		} else if (field === 'textAlign') {
			properties = ['textAlign'];
		} else if (field === 'verticalAlign') {
			properties = [
				'--mtb-cell-vertical-align',
				'--mtb-cell-align-content',
			];
		} else if (field === 'cellBackgroundColor') {
			properties = ['--mtb-cell-bg'];
		} else {
			const [kind, side] = field.split('.') as [SideKind, Side];
			properties = [tokenNames[sideKey(kind, side)]];
		}
		for (const property of properties) {
			if (!property.startsWith('--')) {
				delete style[property];
				continue;
			}
			if (parent[property]) {
				style[property] = parent[property];
			} else {
				delete style[property];
			}
		}
	}
	return style as CSSProperties;
}

/**
 * Drop captured values for applied fields; the new source supplies their styles.
 * Reading the canvas immediately after a store update can still return old CSS.
 * @param environment
 * @param edited
 */
export function rebasePreviewEnvironment(
	environment: PreviewEnvironment,
	edited: BulkPatch
): PreviewEnvironment {
	return {
		...environment,
		table: previewTableContext(environment, edited),
		blocks: Object.fromEntries(
			Object.entries(environment.blocks).map(([id, style]) => [
				id,
				previewTableContext(
					{ table: style, blocks: {}, fontSizes: {} },
					edited
				),
			])
		),
		fontSizes: Object.prototype.hasOwnProperty.call(edited, 'fontSize')
			? {}
			: environment.fontSizes,
	};
}
