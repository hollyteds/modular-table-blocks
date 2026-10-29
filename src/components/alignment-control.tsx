import { __ } from '@wordpress/i18n';
import type { MatrixAlignment } from '../styles/alignment';
import { AlignmentMatrixControl } from './style-compat';

export default function AlignmentControl({
	value,
	onChange,
	disabled,
}: {
	value?: MatrixAlignment;
	onChange: (value?: MatrixAlignment) => void;
	disabled?: boolean;
}) {
	return (
		<AlignmentMatrixControl
			label={__('Alignment', 'modular-table-blocks')}
			value={value}
			onChange={onChange}
			disabled={disabled}
		/>
	);
}
