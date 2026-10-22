import {
	store as blockEditorStore,
	useSettings,
} from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { colorPresets } from '../styles/controls';
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
	return {
		presets: colorPresets(
			{ theme, custom, defaults, defaultPalette },
			legacy.colors,
			key
		),
		disableCustomColors:
			typeof customColors === 'boolean'
				? !customColors
				: legacy.disableCustomColors,
	};
}
