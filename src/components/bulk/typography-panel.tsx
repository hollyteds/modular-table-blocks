import { FontSizePicker, SelectControl } from '@wordpress/components';
import { useSettings } from '@wordpress/block-editor';
import { useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { commonValue } from '../../styles/bulk';
import {
	typographyFields,
	validTypographyValue,
} from '../../styles/typography';
import type { TypographyField } from '../../styles/typography';
import {
	ToolsPanel,
	ToolsPanelItem,
	FontFamilyControl,
	FontAppearanceControl,
	LineHeightControl,
	LetterSpacingControl,
	TextDecorationControl,
	TextTransformControl,
	WritingModeControl,
} from '../style-compat';
import TokenColorControl from '../token-color-control';
import type { BulkCellEditor } from './use-bulk-cell-editor';

type FontPreset = {
	name: string;
	slug: string;
	fontFamily: string;
	fontFace?: Record<string, unknown>[];
};
type SizePreset = { name: string; slug: string; size: string | number };

function presets<T extends { slug: string }>(raw: unknown): T[] {
	let candidates: unknown[] = [];
	if (Array.isArray(raw)) {
		candidates = raw;
	} else if (raw && typeof raw === 'object') {
		candidates = ['custom', 'theme', 'default'].flatMap(
			(key) => (raw as Record<string, unknown[]>)[key] ?? []
		);
	}
	const result = new Map<string, T>();
	for (const candidate of candidates) {
		const entry = candidate as Record<string, unknown> | null;
		if (
			entry &&
			typeof entry === 'object' &&
			typeof entry.slug === 'string' &&
			/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) &&
			!result.has(entry.slug)
		) {
			result.set(entry.slug, entry as T);
		}
	}
	return [...result.values()];
}

const defaults = ['textColor', 'fontSize'];

export default function BulkTypographyPanel({
	editor,
}: {
	editor: BulkCellEditor;
}) {
	const [
		familiesSetting,
		sizesSetting,
		customSize,
		fontStyle,
		fontWeight,
		lineHeight,
		letterSpacing,
		textDecoration,
		textTransform,
		writingMode,
		textColor,
	] = useSettings(
		'typography.fontFamilies',
		'typography.fontSizes',
		'typography.customFontSize',
		'typography.fontStyle',
		'typography.fontWeight',
		'typography.lineHeight',
		'typography.letterSpacing',
		'typography.textDecoration',
		'typography.textTransform',
		'typography.writingMode',
		'color.text'
	);
	const families = presets<FontPreset>(familiesSetting).filter(
		(font) =>
			typeof font.fontFamily === 'string' &&
			validTypographyValue('fontFamily', font.fontFamily)
	);
	const sizes = presets<SizePreset>(sizesSetting).filter(
		(size) => typeof size.size === 'string' || typeof size.size === 'number'
	);
	const [visible, setVisible] = useState<string[]>(defaults);
	const [resetVersion, setResetVersion] = useState(0);
	const latest = useRef({ editor, visible });
	latest.current = { editor, visible };
	const id = `${editor.source.clientId}-bulk-typography`;
	const read = (field: TypographyField) =>
		commonValue(
			editor.areaCells.map((p) => editor.read(p.cell.attributes, field))
		);
	const value = (field: TypographyField) => read(field).value;
	const change = (field: TypographyField, next?: string) =>
		editor.update({ [field]: next || undefined });
	const mixed = (field: TypographyField) =>
		read(field).mixed
			? __('Multiple values', 'modular-table-blocks')
			: undefined;
	const family = families.find(
		(font) =>
			value('fontFamily') ===
			`var(--wp--preset--font-family--${font.slug})`
	);
	const size = sizes.find(
		(preset) =>
			value('fontSize') === `var(--wp--preset--font-size--${preset.slug})`
	);
	const available: Record<string, boolean> = {
		fontFamily: families.length > 0,
		fontSize: customSize !== false || sizes.length > 0,
		appearance: fontStyle !== false || fontWeight !== false,
		lineHeight: lineHeight !== false,
		letterSpacing: letterSpacing !== false,
		textDecoration: textDecoration !== false,
		textTransform: textTransform !== false,
		writingMode: writingMode !== false,
		textColor: textColor !== false,
	};
	const items = [
		{
			key: 'textColor',
			label: __('Text color', 'modular-table-blocks'),
			control: (
				<TokenColorControl
					label={__('Text color', 'modular-table-blocks')}
					token="textColor"
					value={value('textColor')}
					isMixed={read('textColor').mixed}
					onChange={(next) => change('textColor', next)}
				/>
			),
		},
		{
			key: 'fontSize',
			label: __('Font size', 'modular-table-blocks'),
			control: (
				<FontSizePicker
					fontSizes={sizes}
					value={size?.size ?? value('fontSize')}
					disableCustomFontSizes={customSize === false}
					units={['px', 'em', 'rem', '%', 'vw', 'vh']}
					withReset={false}
					withSlider
					onChange={(next) => {
						const preset = sizes.find((p) => p.size === next);
						let saved =
							typeof next === 'number' ? `${next}px` : next;
						if (preset) {
							saved = `var(--wp--preset--font-size--${preset.slug})`;
						}
						change('fontSize', saved);
					}}
				/>
			),
		},
		{
			key: 'fontFamily',
			label: __('Font', 'modular-table-blocks'),
			control: families.length ? (
				<FontFamilyControl
					fontFamilies={families.map((font) => ({
						name: font.name,
						fontFamily: `var(--wp--preset--font-family--${font.slug})`,
					}))}
					value={value('fontFamily')}
					onChange={(next) => change('fontFamily', next)}
				/>
			) : (
				<SelectControl
					label={__('Font', 'modular-table-blocks')}
					value=""
					options={[
						{
							label: __('Default', 'modular-table-blocks'),
							value: '',
						},
					]}
					disabled
					onChange={() => {}}
				/>
			),
		},
		{
			key: 'appearance',
			label: __('Appearance', 'modular-table-blocks'),
			control: (
				<FontAppearanceControl
					value={{
						fontStyle: value('fontStyle'),
						fontWeight: value('fontWeight'),
					}}
					hasFontStyles={fontStyle !== false}
					hasFontWeights={fontWeight !== false}
					fontFamilyFaces={family?.fontFace}
					onChange={(next) =>
						editor.update({
							fontStyle: next.fontStyle,
							fontWeight: next.fontWeight,
						})
					}
				/>
			),
		},
		{
			key: 'lineHeight',
			label: __('Line height', 'modular-table-blocks'),
			control: (
				<LineHeightControl
					value={value('lineHeight')}
					placeholder={mixed('lineHeight')}
					__unstableInputWidth="auto"
					onChange={(next) => change('lineHeight', next)}
				/>
			),
		},
		{
			key: 'letterSpacing',
			label: __('Letter spacing', 'modular-table-blocks'),
			control: (
				<LetterSpacingControl
					value={value('letterSpacing')}
					placeholder={mixed('letterSpacing')}
					__unstableInputWidth="auto"
					onChange={(next) => change('letterSpacing', next)}
				/>
			),
		},
		{
			key: 'textDecoration',
			label: __('Decoration', 'modular-table-blocks'),
			control: (
				<TextDecorationControl
					value={value('textDecoration')}
					onChange={(next) => change('textDecoration', next)}
				/>
			),
		},
		{
			key: 'textTransform',
			label: __('Letter case', 'modular-table-blocks'),
			control: (
				<TextTransformControl
					value={value('textTransform')}
					onChange={(next) => change('textTransform', next)}
				/>
			),
		},
		{
			key: 'writingMode',
			label: __('Orientation', 'modular-table-blocks'),
			control: (
				<WritingModeControl
					value={value('writingMode')}
					onChange={(next) => change('writingMode', next)}
				/>
			),
		},
	];
	return (
		<section
			className="modular-table-blocks-bulk-card"
			aria-label={__('Typography', 'modular-table-blocks')}
		>
			<ToolsPanel
				key={resetVersion}
				className="modular-table-blocks-settings-tools"
				label={__('Typography', 'modular-table-blocks')}
				panelId={id}
				headingLevel={2}
				resetAll={() => {
					const current = latest.current.editor;
					if (current.cells.length && !current.stale) {
						current.update(
							Object.fromEntries(
								typographyFields.map((field) => [
									field,
									undefined,
								])
							)
						);
					}
					setVisible(defaults);
					setResetVersion((v) => v + 1);
				}}
			>
				{items
					.filter((item) => available[item.key])
					.map((item) => (
						<ToolsPanelItem
							key={item.key}
							className="modular-table-blocks-settings-tools-content"
							panelId={id}
							label={item.label}
							isShownByDefault={false}
							// WP 6.6 seeds optional-item visibility via hasValue. Keep
							// this separate from saved values so hiding preserves drafts.
							hasValue={() =>
								latest.current.visible.includes(item.key)
							}
							onSelect={() =>
								setVisible((previous) => [
									...new Set([...previous, item.key]),
								])
							}
							onDeselect={() =>
								setVisible((previous) =>
									previous.filter((key) => key !== item.key)
								)
							}
						>
							{item.control}
						</ToolsPanelItem>
					))}
			</ToolsPanel>
		</section>
	);
}
