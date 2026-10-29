import {
	InspectorControls,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { select } from '@wordpress/data';
import { __, _x } from '@wordpress/i18n';
import {
	ToolsPanelItem,
	backgroundInspectorGroup,
	ToggleGroupControl,
	ToggleGroupControlOption,
} from './style-compat';
import TokenColorControl from './token-color-control';
import type { StyleTokens } from '../styles/tokens';

export default function TableBackgroundControl({
	clientId,
	stripeMode,
	tokens = {},
	onChange,
}: {
	clientId: string;
	stripeMode?: string;
	tokens?: StyleTokens;
	onChange: (attributes: {
		stripeMode?: 'none' | 'rows' | 'columns';
		styleTokens?: StyleTokens;
	}) => void;
}) {
	const resetColors = (current: StyleTokens): StyleTokens => {
		const next = { ...current };
		delete next.headerBackgroundColor;
		delete next.stripeBackgroundColor;
		return next;
	};
	const color = (
		key: 'headerBackgroundColor' | 'stripeBackgroundColor',
		label: string
	) => (
		<TokenColorControl
			label={label}
			token={key}
			value={tokens[key]}
			onChange={(value) => {
				const next = { ...tokens };
				if (value === undefined) {
					delete next[key];
				} else {
					next[key] = value;
				}
				onChange({ styleTokens: next });
			}}
		/>
	);
	return (
		<InspectorControls group={backgroundInspectorGroup()}>
			<ToolsPanelItem
				className="modular-table-blocks-background-rules"
				label={__('Cell background rules', 'modular-table-blocks')}
				panelId={clientId}
				isShownByDefault
				hasValue={() =>
					stripeMode !== undefined ||
					tokens.headerBackgroundColor !== undefined ||
					tokens.stripeBackgroundColor !== undefined
				}
				onDeselect={() =>
					onChange({
						stripeMode: undefined,
						styleTokens: resetColors(tokens),
					})
				}
				resetAllFilter={(attributes) => ({
					...attributes,
					stripeMode: undefined,
					styleTokens: resetColors(
						(attributes.styleTokens as StyleTokens | undefined) ??
							select(blockEditorStore).getBlockAttributes(
								clientId
							)?.styleTokens ??
							{}
					),
				})}
			>
				<div
					className="modular-table-blocks-control-stack"
					role="group"
					aria-label={__(
						'Cell background rules',
						'modular-table-blocks'
					)}
				>
					{color(
						'headerBackgroundColor',
						__('Header background (TH)', 'modular-table-blocks')
					)}
					<ToggleGroupControl
						label={__(
							'Data cell stripes (TD)',
							'modular-table-blocks'
						)}
						value={stripeMode ?? 'none'}
						isBlock
						help={__(
							'Row stripes start in the body; merged cells use their top-left position.',
							'modular-table-blocks'
						)}
						onChange={(value) => {
							if (
								value === 'none' ||
								value === 'rows' ||
								value === 'columns'
							) {
								onChange({ stripeMode: value });
							}
						}}
					>
						<ToggleGroupControlOption
							value="none"
							label={__('None', 'modular-table-blocks')}
						/>
						<ToggleGroupControlOption
							value="rows"
							label={_x(
								'Rows',
								'stripe direction',
								'modular-table-blocks'
							)}
						/>
						<ToggleGroupControlOption
							value="columns"
							label={_x(
								'Columns',
								'stripe direction',
								'modular-table-blocks'
							)}
						/>
					</ToggleGroupControl>
					{(stripeMode === 'rows' || stripeMode === 'columns') &&
						color(
							'stripeBackgroundColor',
							__('Stripe background', 'modular-table-blocks')
						)}
				</div>
			</ToolsPanelItem>
		</InspectorControls>
	);
}
