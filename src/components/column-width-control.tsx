import { Button } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import LengthControl from './length-control';

export default function ColumnWidthControl({
	index,
	value,
	onChange,
}: {
	index: number;
	value: unknown;
	onChange: (width: string) => void;
}) {
	const width = typeof value === 'string' ? value : '';
	const label = sprintf(
		/* translators: %d: one-based column number. */ __(
			'Column %d width',
			'modular-table-blocks'
		),
		index + 1
	);
	return (
		<div
			className="modular-table-blocks-style-control"
			role="group"
			aria-label={label}
		>
			<p>{width || __('Automatic width', 'modular-table-blocks')}</p>
			<LengthControl
				label={label}
				kind="tableWidth"
				value={width}
				onChange={onChange}
			/>
			<Button
				variant="secondary"
				disabled={!width}
				onClick={() => onChange('')}
			>
				{sprintf(
					/* translators: %d: one-based column number. */ __(
						'Reset column %d to automatic width',
						'modular-table-blocks'
					),
					index + 1
				)}
			</Button>
		</div>
	);
}
