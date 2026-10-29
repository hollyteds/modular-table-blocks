import {
	Button,
	ColorIndicator,
	Dropdown,
	Flex,
	FlexItem,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import type { ComponentProps } from 'react';
import { isValidToken } from '../styles/tokens';
import type { TokenKey } from '../styles/tokens';
import { ColorControlButton, ColorPaletteControl } from './style-compat';
import useThemeColors from './use-theme-colors';

function Palette({
	isMixed,
	...props
}: ComponentProps<typeof ColorPaletteControl> & { isMixed: boolean }) {
	// Keep the focused Clear button mounted when clearing resolves mixed values.
	const [mixedAtOpen] = useState(isMixed);
	return (
		<>
			<ColorPaletteControl {...props} clearable={!mixedAtOpen} />
			{mixedAtOpen && (
				<Button variant="tertiary" onClick={() => props.onChange()}>
					{__('Clear', 'modular-table-blocks')}
				</Button>
			)}
		</>
	);
}

export default function TokenColorControl({
	label,
	token,
	value,
	onChange,
	isMixed = false,
}: {
	label: string;
	token: TokenKey;
	value?: string;
	onChange: (value?: string) => void;
	isMixed?: boolean;
}) {
	const { presets, colors, disableCustomColors } = useThemeColors(token);
	const color =
		presets.find((preset) => preset.value === value)?.color ??
		(value && isValidToken(token, value) ? value : undefined);
	return (
		<div className="modular-table-blocks-color-control block-editor-color-gradient-item">
			<Dropdown
				className="block-editor-tools-panel-color-gradient-settings__dropdown"
				renderToggle={({ isOpen, onToggle }) => (
					<ColorControlButton
						__next40pxDefaultSize
						className={`block-editor-panel-color-gradient-settings__dropdown${isOpen ? ' is-open' : ''}`}
						onClick={onToggle}
						aria-expanded={isOpen}
						aria-label={label}
					>
						<Flex
							className="modular-table-blocks-color-toggle-content"
							gap={3}
							justify="flex-start"
						>
							<ColorIndicator
								className="block-editor-panel-color-gradient-settings__color-indicator"
								colorValue={color}
							/>
							<FlexItem className="block-editor-panel-color-gradient-settings__color-name">
								{label}
							</FlexItem>
						</Flex>
					</ColorControlButton>
				)}
				renderContent={() => (
					<div className="modular-table-blocks-color-popover block-editor-panel-color-gradient-settings__dropdown-content">
						<Palette
							showTitle={false}
							label={label}
							colors={colors}
							value={
								presets.find((preset) => preset.value === value)
									?.color ?? value
							}
							disableCustomColors={disableCustomColors}
							enableAlpha
							isMixed={isMixed}
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
					</div>
				)}
			/>
		</div>
	);
}
