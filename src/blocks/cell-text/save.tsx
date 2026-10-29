import type { BlockSaveProps } from '@wordpress/blocks';
import { RichText } from '@wordpress/block-editor';
import type { CellTextAttributes } from './edit';

export default function CellTextSave({
	attributes,
}: Pick<BlockSaveProps<CellTextAttributes>, 'attributes'>) {
	// RichText supplies escaped inline HTML. Protect literal numeric references
	// from older KSES, and boundary whitespace from the block parser's trim.
	const content = attributes.content
		.split('&amp;#')
		.join('&amp;&#35;')
		.replace(/^\s+|\s+$/g, (space) =>
			Array.from(
				space,
				(character) => `&#${character.charCodeAt(0)};`
			).join('')
		);
	return <RichText.Content value={content} />;
}
