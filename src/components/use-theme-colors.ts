import {
	store as blockEditorStore,
	useSettings,
} from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { colorPresetSettings } from '../styles/controls';
import type { Preset } from '../styles/controls';
import type { TokenKey } from '../styles/tokens';

export default function useThemeColors(key: TokenKey) {
	const [theme, custom, defaults, defaultPalette, customColors] = useSettings(
		'color.palette.theme',
		'color.palette.custom',
		'color.palette.default',
		'color.defaultPalette',
		'color.custom'
	);
	const legacy = useSelect(
		(select) => select(blockEditorStore).getSettings(),
		[]
	);
	const { presets, groups } = useMemo(
		() =>
			colorPresetSettings(
				{ theme, custom, defaults, defaultPalette },
				legacy.colors,
				key
			),
		[theme, custom, defaults, defaultPalette, legacy.colors, key]
	);
	const names = {
		theme: __('Theme', 'modular-table-blocks'),
		default: __('Default', 'modular-table-blocks'),
		custom: __('Custom', 'modular-table-blocks'),
	};
	const swatches = (entries: Preset[]) =>
		entries.map((preset) => ({ name: preset.name, color: preset.color! }));
	return {
		presets,
		colors: groups.length
			? groups.map(({ origin, presets: entries }) => ({
					name: names[origin],
					colors: swatches(entries),
				}))
			: swatches(presets),
		disableCustomColors:
			typeof customColors === 'boolean'
				? !customColors
				: legacy.disableCustomColors,
	};
}
