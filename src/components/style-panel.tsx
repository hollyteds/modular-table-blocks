import { PanelBody, TextControl } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { isValidToken, tokenNames } from '../styles/tokens';
import type { StyleTokens, TokenKey } from '../styles/tokens';

const labels: Record<TokenKey, string> = {
	textColor: __('Text color', 'modular-table-blocks'),
	backgroundColor: __('Table background', 'modular-table-blocks'),
	cellBackgroundColor: __('Cell background', 'modular-table-blocks'),
	borderColor: __('Border color', 'modular-table-blocks'),
	borderWidth: __('Border width', 'modular-table-blocks'),
	borderStyle: __('Border style', 'modular-table-blocks'),
	cellPaddingBlock: __('Cell vertical padding', 'modular-table-blocks'),
	cellPaddingInline: __('Cell horizontal padding', 'modular-table-blocks'),
	fontSize: __('Font size', 'modular-table-blocks'),
	lineHeight: __('Line height', 'modular-table-blocks'),
	tableWidth: __('Table width', 'modular-table-blocks'),
};

function TokenInput({
	token,
	value,
	onChange,
}: {
	token: TokenKey;
	value: string;
	onChange: (value: string) => void;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const valid = draft === '' || isValidToken(token, draft);
	return (
		<TextControl
			label={labels[token]}
			value={draft}
			aria-invalid={!valid}
			help={
				valid
					? __(
							'Leave empty to inherit. See README for accepted values.',
							'modular-table-blocks'
						)
					: __(
							'Invalid value. This change has not been saved.',
							'modular-table-blocks'
						)
			}
			onChange={(next) => {
				setDraft(next);
				if (next === '' || isValidToken(token, next)) {
					onChange(next);
				}
			}}
		/>
	);
}

export default function StylePanel({
	tokens = {},
	onChange,
	table = false,
}: {
	tokens?: StyleTokens;
	onChange: (value: StyleTokens) => void;
	table?: boolean;
}) {
	return (
		<PanelBody
			title={__('Table styles', 'modular-table-blocks')}
			initialOpen={false}
		>
			{(Object.keys(tokenNames) as TokenKey[])
				.filter(
					(key) =>
						table ||
						!['backgroundColor', 'tableWidth'].includes(key)
				)
				.map((key) => (
					<TokenInput
						key={key}
						token={key}
						value={tokens[key] ?? ''}
						onChange={(value) => {
							const next = { ...tokens };
							if (value === '') {
								delete next[key];
							} else {
								next[key] = value;
							}
							onChange(next);
						}}
					/>
				))}
		</PanelBody>
	);
}
