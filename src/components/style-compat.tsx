import * as components from '@wordpress/components';
import * as editor from '@wordpress/block-editor';
import type { ComponentType, ReactNode } from 'react';
import type { BorderValue } from '../styles/native-box';
import type { SideValues } from '../styles/sides';

type UnitProps = {
	label: string;
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
		resetAllFilter: (
			attributes: Record<string, unknown>
		) => Record<string, unknown>;
	}>;
};
export const UnitControl =
	controls.UnitControl ?? controls.__experimentalUnitControl;

export const ColorPaletteControl = (
	editor as unknown as {
		ColorPaletteControl: ComponentType<{
			label: string;
			value?: string;
			colors?: { name: string; color: string }[];
			onChange: (value?: string) => void;
			disableCustomColors?: boolean;
			enableAlpha?: boolean;
			clearable?: boolean;
		}>;
	}
).ColorPaletteControl;

type BorderProps = {
	label: string;
	value?: BorderValue;
	colors: { name: string; color: string }[];
	disableCustomColors?: boolean;
	enableAlpha?: boolean;
	enableStyle?: boolean;
	__experimentalIsRenderedInSidebar?: boolean;
	onChange: (value?: BorderValue) => void;
};
export const BorderBoxControl =
	controls.BorderBoxControl ?? controls.__experimentalBorderBoxControl;
export const ToolsPanelItem = controls.__experimentalToolsPanelItem;
export const SpacingSizesControl = (
	editor as unknown as {
		__experimentalSpacingSizesControl: ComponentType<{
			label: string;
			values: SideValues;
			onChange: (value: SideValues) => void;
		}>;
	}
).__experimentalSpacingSizesControl;
