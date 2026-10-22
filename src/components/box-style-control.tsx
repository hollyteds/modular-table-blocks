import {
	InspectorControls,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Notice } from '@wordpress/components';
import { select } from '@wordpress/data';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import type { StyleTokens } from '../styles/tokens';
import useThemeColors from './use-theme-colors';
import {
	applyBorderValue,
	applyPaddingValue,
	borderControlValue,
	paddingControlValue,
	resetBoxTokens,
} from '../styles/native-box';
import {
	BorderBoxControl,
	SpacingSizesControl,
	ToolsPanelItem,
} from './style-compat';

export default function BoxStyleControl({
	tokens,
	onChange,
	clientId,
	border = false,
}: {
	tokens: StyleTokens;
	onChange: (tokens: StyleTokens) => void;
	clientId: string;
	border?: boolean;
}) {
	const { presets, disableCustomColors } = useThemeColors('borderColor');
	const [invalid, setInvalid] = useState<StyleTokens>();
	const label = border
		? __('Border', 'modular-table-blocks')
		: __('Padding', 'modular-table-blocks');
	const reset = () => {
		setInvalid(undefined);
		onChange(resetBoxTokens(tokens, border));
	};
	const change = (update: () => StyleTokens) => {
		try {
			const next = update();
			setInvalid(undefined);
			if (next !== tokens) {
				onChange(next);
			}
		} catch {
			setInvalid(tokens);
		}
	};
	return (
		<InspectorControls group={border ? 'border' : 'dimensions'}>
			<ToolsPanelItem
				className={`modular-table-blocks-style-control modular-table-blocks-${border ? 'border' : 'padding'}-control`}
				label={label}
				panelId={clientId}
				isShownByDefault
				hasValue={() =>
					Object.keys(resetBoxTokens(tokens, border)).length !==
					Object.keys(tokens).length
				}
				onDeselect={reset}
				resetAllFilter={(attributes) => ({
					...attributes,
					// Older ToolsPanel versions retain callbacks; read the latest attributes.
					styleTokens: resetBoxTokens(
						select(blockEditorStore).getBlockAttributes(clientId)
							?.styleTokens ?? {},
						border
					),
				})}
			>
				{border ? (
					<BorderBoxControl
						label={label}
						value={borderControlValue(tokens, presets)}
						colors={presets.map((preset) => ({
							name: preset.name,
							color: preset.color!,
						}))}
						disableCustomColors={disableCustomColors}
						enableAlpha
						enableStyle
						__experimentalIsRenderedInSidebar
						onChange={(value) =>
							change(() =>
								applyBorderValue(tokens, value, presets)
							)
						}
					/>
				) : (
					<SpacingSizesControl
						label={label}
						values={paddingControlValue(tokens)}
						onChange={(value) =>
							change(() => applyPaddingValue(tokens, value))
						}
					/>
				)}
				{invalid === tokens && (
					<Notice status="error" isDismissible={false}>
						{__(
							'Unsupported value or unit. Border: 0–20px or 0–1em/rem; padding: 0–200px or 0–10em/rem.',
							'modular-table-blocks'
						)}
					</Notice>
				)}
			</ToolsPanelItem>
		</InspectorControls>
	);
}
