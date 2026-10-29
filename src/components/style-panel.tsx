import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import type { StyleTokens } from '../styles/tokens';
import TokenColorControl from './token-color-control';
import BoxStyleControl from './box-style-control';

export default function StylePanel({
	tokens = {},
	onChange,
	clientId,
}: {
	tokens?: StyleTokens;
	onChange: (value: StyleTokens) => void;
	clientId: string;
}) {
	const label = __('Cell background', 'modular-table-blocks');
	return (
		<>
			<BoxStyleControl
				border
				tokens={tokens}
				onChange={onChange}
				clientId={clientId}
			/>
			<BoxStyleControl
				tokens={tokens}
				onChange={onChange}
				clientId={clientId}
			/>
			<InspectorControls group="styles">
				<PanelBody
					title={__('Background', 'modular-table-blocks')}
					initialOpen={false}
				>
					<div
						className="modular-table-blocks-style-control"
						role="group"
						aria-label={label}
					>
						<TokenColorControl
							label={label}
							token="cellBackgroundColor"
							value={tokens.cellBackgroundColor}
							onChange={(value) => {
								const next = { ...tokens };
								if (value === undefined) {
									delete next.cellBackgroundColor;
								} else {
									next.cellBackgroundColor = value;
								}
								onChange(next);
							}}
						/>
					</div>
				</PanelBody>
			</InspectorControls>
		</>
	);
}
