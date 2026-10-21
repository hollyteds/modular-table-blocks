import { TextControl } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { validColumnWidth } from '../styles/columns';

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
	const [draft, setDraft] = useState(width);
	useEffect(() => setDraft(width), [width]);
	const valid = draft === '' || validColumnWidth(draft);
	return (
		<TextControl
			label={sprintf(
				/* translators: %d: one-based column number. */
				__('Column %d width', 'modular-table-blocks'),
				index + 1
			)}
			value={draft}
			aria-invalid={!valid}
			help={
				valid
					? __(
							'Leave empty for automatic width. Use %, px, rem or em.',
							'modular-table-blocks'
						)
					: __(
							'Invalid value. This change has not been saved.',
							'modular-table-blocks'
						)
			}
			onChange={(next) => {
				setDraft(next);
				if (next === '' || validColumnWidth(next)) {
					onChange(next);
				}
			}}
		/>
	);
}
