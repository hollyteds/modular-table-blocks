import type { BlockEditProps } from '@wordpress/blocks';
import {
	useBlockProps,
	useInnerBlocksProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { useContext } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { TableLayout } from '../../grid/layout-context';
import StylePanel from '../../components/style-panel';
import { editorStyle } from '../../styles/native';
import type { NativeStyleAttributes } from '../../styles/native';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import { columnTemplate } from '../../styles/columns';

export type RowAttributes = NativeStyleAttributes & {
	section: string;
	styleTokens?: StyleTokens;
};

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
	const description = sprintf(
		/* translators: %d: one-based row number. */ __(
			'Table row %d',
			'modular-table-blocks'
		),
		index + 1
	);
	const props = useInnerBlocksProps(
		useBlockProps({
			'aria-describedby': `mtb-row-position-${clientId}`,
			className: `modular-table-blocks-editor__row${header ? ' modular-table-blocks-editor__row--header' : ''}`,
			style: {
				...editorStyle(attributes),
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
			<StylePanel
				clientId={clientId}
				tokens={attributes.styleTokens}
				onChange={(styleTokens) => setAttributes({ styleTokens })}
			/>
			<div {...props}>
				<span
					id={`mtb-row-position-${clientId}`}
					className="modular-table-blocks-editor__position"
				>
					{description}
				</span>
				{props.children}
			</div>
		</>
	);
}
