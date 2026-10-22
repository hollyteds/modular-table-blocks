import {
	Button,
	ButtonGroup,
	ColorIndicator,
	Dropdown,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { isValidToken } from '../styles/tokens';
import type { TokenKey } from '../styles/tokens';
import { ColorPaletteControl } from './style-compat';
import useThemeColors from './use-theme-colors';

export default function TokenColorControl({
	label,
	token,
	value,
	onChange,
}: {
	label: string;
	token: TokenKey;
	value?: string;
	onChange: (value?: string) => void;
}) {
	const { presets, disableCustomColors } = useThemeColors(token);
	return (
		<div className="modular-table-blocks-color-control">
			<Dropdown
				renderToggle={({ isOpen, onToggle }) => (
					<Button
						variant="secondary"
						onClick={onToggle}
						aria-expanded={isOpen}
						aria-label={label}
					>
						<ColorIndicator
							colorValue={
								presets.find((preset) => preset.value === value)
									?.color ??
								(value?.startsWith('#') ? value : 'transparent')
							}
						/>
						{label}
					</Button>
				)}
				renderContent={() => (
					<div className="modular-table-blocks-color-popover">
						<ColorPaletteControl
							label={label}
							colors={presets.map((preset) => ({
								name: preset.name,
								color: preset.color!,
							}))}
							value={
								presets.find((preset) => preset.value === value)
									?.color ??
								(value?.startsWith('#') ? value : undefined)
							}
							disableCustomColors={disableCustomColors}
							enableAlpha
							clearable
							onChange={(next) => {
								const saved =
									presets.find(
										(preset) =>
											preset.color?.toLowerCase() ===
											next?.toLowerCase()
									)?.value ?? next;
								if (
									saved === undefined ||
									isValidToken(token, saved)
								) {
									onChange(saved);
								}
							}}
						/>
						<ButtonGroup aria-label={label}>
							<Button
								size="small"
								isPressed={value === 'transparent'}
								onClick={() => onChange('transparent')}
							>
								{__('Transparent', 'modular-table-blocks')}
							</Button>
							<Button
								size="small"
								isPressed={value === 'currentColor'}
								onClick={() => onChange('currentColor')}
							>
								{__(
									'Current text color',
									'modular-table-blocks'
								)}
							</Button>
						</ButtonGroup>
					</div>
				)}
			/>
		</div>
	);
}
