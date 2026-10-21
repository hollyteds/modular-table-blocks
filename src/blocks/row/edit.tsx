import type { BlockEditProps } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { useContext } from '@wordpress/element';
import { TableLayout } from '../../grid/layout-context';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import { columnTemplate } from '../../styles/columns';

export type RowAttributes = { section: string; styleTokens?: StyleTokens };

export default function RowEdit({
	context,
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<RowAttributes>) {
	const columns = context['modular-table-blocks/columns'];
	const layout = useContext(TableLayout);
	const index = useSelect(
		(select) => select(blockEditorStore).getBlockIndex(clientId),
		[clientId]
	);
	const header =
		typeof context['modular-table-blocks/headerRows'] === 'number' &&
		index < context['modular-table-blocks/headerRows'];
	const height = Math.max(
		1,
		...layout.cells.filter((p) => p.row === index).map((p) => p.height)
	);
	const props = useInnerBlocksProps(
		useBlockProps({
			className: `modular-table-blocks-editor__row${header ? ' modular-table-blocks-editor__row--header' : ''}`,
			style: {
				...tokenStyle(attributes.styleTokens),
				gridTemplateColumns: layout.valid
					? 'subgrid'
					: columnTemplate(columns),
				gridTemplateRows: layout.valid ? 'subgrid' : undefined,
				gridColumn: layout.valid ? '1 / -1' : undefined,
				gridRow: layout.valid
					? `${index + 1} / span ${height}`
					: undefined,
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
			<StructureControls clientId={clientId} />
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
