import { __ } from '@wordpress/i18n';
import type { StyleTokens } from '../styles/tokens';
import LengthControl from './length-control';

export default function TableWidthControl({
	tokens = {},
	onChange,
	hideLabelFromVision = false,
}: {
	tokens?: StyleTokens;
	hideLabelFromVision?: boolean;
	onChange: (value: StyleTokens) => void;
}) {
	const change = (value?: string) => {
		const next = { ...tokens };
		if (value) {
			next.tableWidth = value;
		} else {
			delete next.tableWidth;
		}
		onChange(next);
	};
	return (
		<LengthControl
			label={__('Table width', 'modular-table-blocks')}
			hideLabelFromVision={hideLabelFromVision}
			kind="tableWidth"
			value={tokens.tableWidth ?? ''}
			onChange={change}
		/>
	);
}
