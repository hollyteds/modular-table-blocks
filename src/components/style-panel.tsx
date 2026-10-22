import { InspectorControls } from '@wordpress/block-editor';
import { Button, PanelBody } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import type { StyleTokens, TokenKey } from '../styles/tokens';
import LengthControl from './length-control';
import TokenColorControl from './token-color-control';
import BoxStyleControl from './box-style-control';

export default function StylePanel({
	tokens = {},
	onChange,
	table = false,
	clientId,
}: {
	tokens?: StyleTokens;
	onChange: (value: StyleTokens) => void;
	table?: boolean;
	clientId: string;
}) {
	const change = (key: TokenKey, value?: string) => {
		const next = { ...tokens };
		if (value === undefined) {
			delete next[key];
		} else {
			next[key] = value;
		}
		onChange(next);
	};
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
			<InspectorControls>
				<PanelBody
					title={__('Table styles', 'modular-table-blocks')}
					initialOpen={false}
				>
					{(table
						? ([
								'backgroundColor',
								'cellBackgroundColor',
								'tableWidth',
							] as const)
						: (['cellBackgroundColor'] as const)
					).map((key) => {
						const label = {
							backgroundColor: __(
								'Table background',
								'modular-table-blocks'
							),
							cellBackgroundColor: __(
								'Cell background',
								'modular-table-blocks'
							),
							tableWidth: __(
								'Table width',
								'modular-table-blocks'
							),
						}[key];
						return (
							<div
								key={key}
								className="modular-table-blocks-style-control"
								role="group"
								aria-label={label}
							>
								<p>
									{tokens[key] ??
										__(
											'Inherited from the parent or site.',
											'modular-table-blocks'
										)}
								</p>
								{key === 'tableWidth' ? (
									<LengthControl
										label={label}
										kind="tableWidth"
										value={tokens[key] ?? ''}
										onChange={(value) =>
											change(key, value || undefined)
										}
									/>
								) : (
									<TokenColorControl
										label={label}
										token={key}
										value={tokens[key]}
										onChange={(value) => change(key, value)}
									/>
								)}
								<Button
									variant="secondary"
									disabled={tokens[key] === undefined}
									onClick={() => change(key)}
								>
									{sprintf(
										/* translators: %s: setting name. */ __(
											'Reset %s to inherit',
											'modular-table-blocks'
										),
										label
									)}
								</Button>
							</div>
						);
					})}
				</PanelBody>
			</InspectorControls>
		</>
	);
}
