import type { BlockEditProps } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
} from '@wordpress/block-editor';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';

export type RowAttributes = { section: string; styleTokens?: StyleTokens };

export default function RowEdit({
	context,
	attributes,
	setAttributes,
}: BlockEditProps<RowAttributes>) {
	const columns = context['modular-table-blocks/columns'];
	const count = Array.isArray(columns)
		? Math.max(1, Math.min(50, columns.length))
		: 3;
	const props = useInnerBlocksProps(
		useBlockProps({
			className: 'modular-table-blocks-editor__row',
			style: {
				...tokenStyle(attributes.styleTokens),
				gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
			},
		}),
		{
			allowedBlocks: ['modular-table-blocks/cell'],
			orientation: 'horizontal',
			templateLock: 'all',
			renderAppender: () => null,
		}
	);
	return (
		<>
			<InspectorControls>
				<StylePanel
					tokens={attributes.styleTokens}
					onChange={(styleTokens) => setAttributes({ styleTokens })}
				/>
			</InspectorControls>
			<div {...props} />
		</>
	);
}
