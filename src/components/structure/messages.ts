import { __ } from '@wordpress/i18n';

export const structureMessages: Record<string, string> = {
	'invalid-grid': __(
		'The table grid is inconsistent. Structure changes are disabled.',
		'modular-table-blocks'
	),
	'ambiguous-row-operation': __(
		'Split cells spanning these rows before moving or duplicating a row.',
		'modular-table-blocks'
	),
	'ambiguous-column-operation': __(
		'Split cells spanning these columns before moving or duplicating a column.',
		'modular-table-blocks'
	),
	'invalid-selection': __(
		'Choose a rectangular range inside the table.',
		'modular-table-blocks'
	),
	'partial-merge': __(
		'The range must contain at least two complete cells. Include every part of existing merged cells.',
		'modular-table-blocks'
	),
	'not-merged': __('This cell is not merged.', 'modular-table-blocks'),
	'section-boundary': __(
		'This operation would cross a header or section boundary. Split the affected cells first.',
		'modular-table-blocks'
	),
	'invalid-index': __(
		'The selection changed. Select the row or cell again.',
		'modular-table-blocks'
	),
	'last-row': __('The last row cannot be deleted.', 'modular-table-blocks'),
	'last-column': __(
		'The last column cannot be deleted.',
		'modular-table-blocks'
	),
	'size-limit': __(
		'Tables support up to 100 rows and 50 columns.',
		'modular-table-blocks'
	),
};
