import type { BlockEditProps } from '@wordpress/blocks';
import { RichText, useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

export type CellTextAttributes = { content: string };

export default function CellTextEdit({
	attributes,
	setAttributes,
}: BlockEditProps<CellTextAttributes>) {
	return (
		<div
			{...useBlockProps({ className: 'modular-table-blocks-cell-text' })}
		>
			<RichText
				tagName="div"
				identifier="content"
				aria-label={__('Cell text', 'modular-table-blocks')}
				placeholder={__('Enter cell text…', 'modular-table-blocks')}
				value={attributes.content}
				onChange={(content) => setAttributes({ content })}
			/>
		</div>
	);
}
