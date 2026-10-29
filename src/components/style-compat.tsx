import * as components from '@wordpress/components';
import * as editor from '@wordpress/block-editor';
import type {
	ComponentProps,
	ComponentType,
	ReactNode,
	SyntheticEvent,
} from 'react';
import { matrixPosition, normalizeMatrixAlignment } from '../styles/alignment';
import type { MatrixAlignment } from '../styles/alignment';
import type { BorderValue } from '../styles/native-box';
import type { SideValues } from '../styles/sides';
import { store as blockEditorStore } from '@wordpress/block-editor';
import type { useRegistry } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';

declare global {
	interface Window {
		modularTableBlocksSettings?: {
			backgroundInspectorGroup: 'color' | 'background';
		};
	}
}

// The standard background color lives in Color before WordPress 7.1.
export function backgroundInspectorGroup(): 'color' | 'background' {
	return (
		window.modularTableBlocksSettings?.backgroundInspectorGroup ?? 'color'
	);
}

// Standard color controls opt in to the 40px Button size; older typings omit it.
export const ColorControlButton = components.Button as unknown as ComponentType<
	ComponentProps<typeof components.Button> & {
		__next40pxDefaultSize: boolean;
	}
>;

// Public since before WordPress 6.6; DefinitelyTyped omits the third argument.
export function updateBulkAttributes(
	registry: ReturnType<typeof useRegistry>,
	updates: Record<string, Record<string, unknown>>
) {
	const actions = registry.dispatch(blockEditorStore) as unknown as {
		__unstableMarkLastChangeAsPersistent?: () => void;
		updateBlockAttributes: (
			ids: string[],
			attributes: typeof updates,
			uniqueByBlock: boolean
		) => void;
	};
	if (!Object.keys(updates).length) {
		return;
	}
	// Atomic commands must not merge into typing history when consecutive applies
	// update the same IDs and attribute keys. Exported by WP 6.6 and current core;
	// keep this compatibility dependency here, covered by repeated-apply E2E.
	actions.__unstableMarkLastChangeAsPersistent?.();
	actions.updateBlockAttributes(Object.keys(updates), updates, true);
}

type UnitProps = {
	label: string;
	hideLabelFromVision?: boolean;
	value?: string;
	unit?: string;
	units: { value: string; label: string; step?: number }[];
	min?: number;
	max?: number;
	step?: number;
	placeholder?: string;
	onChange: (value?: string) => void;
	onUnitChange?: (unit?: string) => void;
};

// WordPress 6.6 exports UnitControl under its experimental name. Keep this
// dependency isolated; no privateApis/unlock or package-internal imports.
const controls = components as unknown as {
	ToolsPanel?: ComponentType<ToolsPanelProps>;
	__experimentalToolsPanel: ComponentType<ToolsPanelProps>;
	ToggleGroupControl?: ComponentType<ToggleGroupProps>;
	__experimentalToggleGroupControl: ComponentType<ToggleGroupProps>;
	ToggleGroupControlOption?: ComponentType<ToggleOptionProps>;
	__experimentalToggleGroupControlOption: ComponentType<ToggleOptionProps>;
	AlignmentMatrixControl?: ComponentType<MatrixProps>;
	__experimentalAlignmentMatrixControl: ComponentType<MatrixProps>;
	UnitControl?: ComponentType<UnitProps>;
	__experimentalUnitControl: ComponentType<UnitProps>;
	BorderBoxControl?: ComponentType<BorderProps>;
	__experimentalBorderBoxControl: ComponentType<BorderProps>;
	__experimentalToolsPanelItem: ComponentType<{
		children: ReactNode;
		className?: string;
		label: string;
		panelId: string;
		isShownByDefault: boolean;
		hasValue: () => boolean;
		onDeselect: () => void;
		onSelect?: () => void;
		resetAllFilter?: (
			attributes: Record<string, unknown>
		) => Record<string, unknown>;
	}>;
};
type ToolsPanelProps = {
	children: ReactNode;
	className?: string;
	label: string;
	panelId: string;
	headingLevel?: number;
	resetAll: () => void;
};
// ToolsPanel creates the standard ToolsPanelHeader and its options menu.
export const ToolsPanel =
	controls.ToolsPanel ?? controls.__experimentalToolsPanel;
type ToggleGroupProps = {
	label: string;
	hideLabelFromVision?: boolean;
	value: string;
	help?: string;
	disabled?: boolean;
	isBlock?: boolean;
	isDeselectable?: boolean;
	onChange: (value?: string | number) => void;
	children: ReactNode;
};
type ToggleOptionProps = { label: string; value: string; disabled?: boolean };
export const ToggleGroupControl =
	controls.ToggleGroupControl ?? controls.__experimentalToggleGroupControl;
export const ToggleGroupControlOption =
	controls.ToggleGroupControlOption ??
	controls.__experimentalToggleGroupControlOption;
type MatrixProps = {
	label: string;
	value?: MatrixAlignment;
	onChange: (value: string) => void;
};
const NativeMatrix =
	controls.AlignmentMatrixControl ??
	controls.__experimentalAlignmentMatrixControl;

// Native matrices track keyboard focus but have no deselection API. Read their
// public 3×3 grid semantics; React owns the selected value and empty appearance.
export function AlignmentMatrixControl({
	label,
	value,
	onChange,
	disabled = false,
}: {
	label: string;
	value?: MatrixAlignment;
	onChange: (next?: MatrixAlignment) => void;
	disabled?: boolean;
}) {
	const pointer = useRef<{ previous?: MatrixAlignment }>();
	const keyboard = useRef(false);
	const position = (event: SyntheticEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement;
		const cell = target.closest('[role="gridcell"]');
		const cells = Array.from(
			event.currentTarget.querySelectorAll('[role="gridcell"]')
		);
		return cell && cells.length === 9
			? matrixPosition(cells.indexOf(cell))
			: undefined;
	};
	return (
		<div
			{...{ inert: disabled ? '' : undefined }}
			aria-disabled={disabled || undefined}
			className={`modular-table-blocks-alignment-matrix${value ? '' : ' modular-table-blocks-alignment-matrix--empty'}`}
			onPointerDownCapture={() => {
				pointer.current = { previous: value };
				keyboard.current = false;
			}}
			onPointerCancelCapture={() => {
				pointer.current = undefined;
			}}
			onBlurCapture={(event) => {
				if (
					!event.currentTarget.contains(
						event.relatedTarget as Node | null
					)
				) {
					keyboard.current = false;
				}
			}}
			onClickCapture={(event) => {
				if (disabled) {
					return;
				}
				const next = position(event);
				const previous = pointer.current
					? pointer.current.previous
					: value;
				pointer.current = undefined;
				keyboard.current = false;
				if (!next) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				onChange(previous === next ? undefined : next);
			}}
			onKeyDownCapture={(event) => {
				if (disabled) {
					return;
				}
				if (event.key === 'Enter' || event.key === ' ') {
					keyboard.current = false;
					pointer.current = undefined;
					const next = position(event);
					if (!next) {
						return;
					}
					event.preventDefault();
					event.stopPropagation();
					onChange(value === next ? undefined : next);
				} else if (
					[
						'ArrowLeft',
						'ArrowRight',
						'ArrowUp',
						'ArrowDown',
						'Home',
						'End',
					].includes(event.key)
				) {
					pointer.current = undefined;
					keyboard.current = true;
				}
			}}
		>
			<NativeMatrix
				label={label}
				value={value}
				onChange={(next) => {
					const normalized = normalizeMatrixAlignment(next);
					if (
						!disabled &&
						keyboard.current &&
						!pointer.current &&
						normalized
					) {
						onChange(normalized);
					}
				}}
			/>
		</div>
	);
}
export const UnitControl =
	controls.UnitControl ?? controls.__experimentalUnitControl;

type PaletteColors =
	| { name: string; color: string }[]
	| { name: string; colors: { name: string; color: string }[] }[];

export const ColorPaletteControl = (
	editor as unknown as {
		ColorPaletteControl: ComponentType<{
			label: string;
			value?: string;
			colors?: PaletteColors;
			onChange: (value?: string) => void;
			disableCustomColors?: boolean;
			enableAlpha?: boolean;
			clearable?: boolean;
			showTitle?: boolean;
		}>;
	}
).ColorPaletteControl;

type BorderProps = {
	className?: string;
	label: string;
	value?: BorderValue;
	colors: PaletteColors;
	disableCustomColors?: boolean;
	enableAlpha?: boolean;
	enableStyle?: boolean;
	__experimentalIsRenderedInSidebar?: boolean;
	onChange: (value?: BorderValue) => void;
};
const NativeBorderBoxControl =
	controls.BorderBoxControl ?? controls.__experimentalBorderBoxControl;
export function BorderBoxControl({ className, ...props }: BorderProps) {
	return (
		<NativeBorderBoxControl
			{...props}
			className={['modular-table-blocks-border-box-control', className]
				.filter(Boolean)
				.join(' ')}
		/>
	);
}
export const ToolsPanelItem = controls.__experimentalToolsPanelItem;

// The native typography controls are publicly exported under experimental names
// in WordPress 6.6. Keep those exports and their missing typings in this layer.
type TypographyControlProps = {
	value?: string;
	onChange: (value?: string) => void;
};
const typographyControls = editor as unknown as {
	__experimentalFontFamilyControl: ComponentType<
		TypographyControlProps & {
			fontFamilies: { name: string; fontFamily: string }[];
		}
	>;
	__experimentalFontAppearanceControl: ComponentType<{
		value: { fontStyle?: string; fontWeight?: string };
		onChange: (value: { fontStyle?: string; fontWeight?: string }) => void;
		hasFontStyles?: boolean;
		hasFontWeights?: boolean;
		fontFamilyFaces?: Record<string, unknown>[];
	}>;
	__experimentalLetterSpacingControl: ComponentType<
		TypographyControlProps & {
			__unstableInputWidth?: string;
			placeholder?: string;
		}
	>;
	__experimentalTextDecorationControl: ComponentType<TypographyControlProps>;
	__experimentalTextTransformControl: ComponentType<TypographyControlProps>;
	__experimentalWritingModeControl: ComponentType<TypographyControlProps>;
	LineHeightControl: ComponentType<
		TypographyControlProps & {
			__unstableInputWidth?: string;
			placeholder?: string;
		}
	>;
};
export const FontFamilyControl =
	typographyControls.__experimentalFontFamilyControl;
export const FontAppearanceControl =
	typographyControls.__experimentalFontAppearanceControl;
export const LetterSpacingControl =
	typographyControls.__experimentalLetterSpacingControl;
export const TextDecorationControl =
	typographyControls.__experimentalTextDecorationControl;
export const TextTransformControl =
	typographyControls.__experimentalTextTransformControl;
export const WritingModeControl =
	typographyControls.__experimentalWritingModeControl;
export const LineHeightControl = typographyControls.LineHeightControl;
const NativeSpacingSizesControl = (
	editor as unknown as {
		__experimentalSpacingSizesControl: ComponentType<{
			label: string;
			values: SideValues;
			onChange: (value: SideValues) => void;
		}>;
	}
).__experimentalSpacingSizesControl;

// WP 6.6 omits the label on its custom-spacing slider. Add React-owned labels
// associated with those IDs; inspect the DOM, never mutate the native controls.
export function SpacingSizesControl(props: {
	label: string;
	values: SideValues;
	onChange: (value: SideValues) => void;
}) {
	const root = useRef<HTMLDivElement>(null);
	const [missing, setMissing] = useState<Record<string, string>>({});
	useEffect(() => {
		const node = root.current;
		if (!node) {
			return;
		}
		const inspect = () => {
			const next: Record<string, string> = {};
			node.querySelectorAll<HTMLInputElement>(
				'input[type="range"]'
			).forEach((input, index) => {
				const nativeLabels = Array.from(input.labels ?? []).filter(
					(label) =>
						!label.classList.contains(
							'modular-table-blocks-control-label'
						)
				);
				if (
					!input.id ||
					nativeLabels.length ||
					input.getAttribute('aria-label') ||
					input.getAttribute('aria-labelledby')
				) {
					return;
				}
				const wrapper = input.closest(
					'.spacing-sizes-control__wrapper'
				);
				const unit = wrapper?.querySelector<HTMLInputElement>(
					'input:not([type="range"])'
				);
				const label = Array.from(unit?.labels ?? [])
					.map((item) => item.textContent)
					.join(' ')
					.trim();
				next[input.id] = `${label || props.label} (${index + 1})`;
			});
			setMissing((previous) =>
				JSON.stringify(previous) === JSON.stringify(next)
					? previous
					: next
			);
		};
		const observer = new MutationObserver(inspect);
		observer.observe(node, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['id', 'aria-label', 'aria-labelledby'],
		});
		inspect();
		return () => observer.disconnect();
	}, [props.label]);
	return (
		<div ref={root}>
			<NativeSpacingSizesControl {...props} />
			{Object.entries(missing).map(([id, label]) => (
				<label
					className="modular-table-blocks-control-label screen-reader-text"
					key={id}
					htmlFor={id}
				>
					{label}
				</label>
			))}
		</div>
	);
}
