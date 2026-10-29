import type { BlockEditProps } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Notice, PanelBody, SelectControl } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';
import { useContext } from '@wordpress/element';
import { cellSemantics } from '../../grid/cell-type';
import { TableLayout } from '../../grid/layout-context';
import { backgroundMarkers } from '../../styles/background';
import StylePanel from '../../components/style-panel';
import { editorStyle, migrateStyleAttributes } from '../../styles/native';
import type { NativeStyleAttributes } from '../../styles/native';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import AlignmentControl from '../../components/alignment-control';
import { alignmentPatch, matrixAlignment } from '../../styles/alignment';
import {
	ToggleGroupControl,
	ToggleGroupControlOption,
} from '../../components/style-compat';
import {
	CELL_CONTENT_BLOCKS,
	CELL_TEXT_BLOCK,
	cellContentMode,
} from '../../content';

export type CellAttributes = NativeStyleAttributes & {
	tag: 'td' | 'th';
	scope: '' | 'col' | 'row' | 'colgroup' | 'rowgroup';
	row: number;
	column: number;
	colSpan: number;
	rowSpan: number;
	styleTokens?: StyleTokens;
	horizontalAlign: '' | 'left' | 'center' | 'right';
	verticalAlign?: 'top' | 'middle' | 'bottom';
};

const noAppender = () => null;

export default function CellEdit({
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<CellAttributes>) {
	const layout = useContext(TableLayout);
	const mode = useSelect(
		(select) =>
			cellContentMode(select(blockEditorStore).getBlocks(clientId)),
		[clientId]
	);
	const position = layout.cells.find((p) => p.cell.clientId === clientId);
	const semantics = cellSemantics(layout, {
		...attributes,
		row: position?.row,
	});
	const header = semantics.isManagedHeader;
	const description = position
		? sprintf(
				/* translators: 1: row number, 2: column number. */ __(
					'Table cell: row %1$d, column %2$d',
					'modular-table-blocks'
				),
				position.row + 1,
				position.column + 1
			)
		: __('Table cell', 'modular-table-blocks');
	const props = useInnerBlocksProps(
		useBlockProps({
			'aria-describedby': `mtb-cell-position-${clientId}`,
			...backgroundMarkers(layout.background ?? {}, attributes),
			'data-mtb-row': position?.row,
			'data-mtb-column': position?.column,
			className: `modular-table-blocks-editor__cell${semantics.tag === 'th' ? ' modular-table-blocks-editor__cell--header' : ''}`,
			style: {
				...editorStyle(attributes),
				gridColumn: position
					? `${position.column + 1} / span ${position.width}`
					: undefined,
				gridRow: position
					? `${position.row + 1} / span ${position.height}`
					: undefined,
			},
		}),
		{
			// WP 6.6 uses these arrays as useMemo dependency arrays. Keep their
			// length stable; the compatibility filter controls text availability.
			allowedBlocks: CELL_CONTENT_BLOCKS,
			prioritizedInserterBlocks: CELL_CONTENT_BLOCKS,
			defaultBlock: {
				name: mode === 'empty' ? CELL_TEXT_BLOCK : 'core/paragraph',
			},
			renderAppender:
				mode === 'text' || mode === 'mixed' ? noAppender : undefined,
			directInsert: false,
			templateLock: false,
		}
	);
	return (
		<>
			<StructureControls clientId={clientId} />
			<InspectorControls>
				<PanelBody title={__('Cell settings', 'modular-table-blocks')}>
					{mode === 'mixed' && (
						<Notice status="warning" isDismissible={false}>
							{__(
								'This cell contains Cell text alongside other blocks. Content has been preserved. Convert Cell text to paragraphs or remove extra blocks.',
								'modular-table-blocks'
							)}
						</Notice>
					)}
					<ToggleGroupControl
						label={__('Cell type', 'modular-table-blocks')}
						value={header ? 'th' : attributes.tag}
						disabled={header}
						isBlock
						help={
							header
								? __(
										'Managed by the table header row (TH).',
										'modular-table-blocks'
									)
								: undefined
						}
						onChange={(tag) => {
							if (!header && (tag === 'th' || tag === 'td')) {
								setAttributes({ tag });
							}
						}}
					>
						<ToggleGroupControlOption
							value="td"
							label={__('Data cell (TD)', 'modular-table-blocks')}
							disabled={header}
						/>
						<ToggleGroupControlOption
							value="th"
							label={__(
								'Header cell (TH)',
								'modular-table-blocks'
							)}
							disabled={header}
						/>
					</ToggleGroupControl>
					{semantics.tag === 'th' && (
						<SelectControl
							label={__(
								'Header association',
								'modular-table-blocks'
							)}
							value={header ? 'col' : attributes.scope}
							disabled={header}
							options={[
								{
									label: __('None', 'modular-table-blocks'),
									value: '',
								},
								{
									label: __('Column', 'modular-table-blocks'),
									value: 'col',
								},
								{
									label: __('Row', 'modular-table-blocks'),
									value: 'row',
								},
								{
									label: __(
										'Column group',
										'modular-table-blocks'
									),
									value: 'colgroup',
								},
								{
									label: __(
										'Row group',
										'modular-table-blocks'
									),
									value: 'rowgroup',
								},
							]}
							onChange={(scope: CellAttributes['scope']) =>
								setAttributes({ scope })
							}
						/>
					)}
				</PanelBody>
			</InspectorControls>
			<InspectorControls group="styles">
				<PanelBody title={__('Alignment', 'modular-table-blocks')}>
					<AlignmentControl
						value={matrixAlignment(
							attributes.verticalAlign ?? layout.verticalAlign,
							migrateStyleAttributes(attributes).style?.typography
								?.textAlign
						)}
						onChange={(next) => {
							const patch = alignmentPatch(next);
							const style =
								migrateStyleAttributes(attributes).style ?? {};
							const typography = { ...style.typography };
							delete typography.textAlign;
							if (patch.textAlign) {
								typography.textAlign = patch.textAlign;
							}
							setAttributes({
								verticalAlign: patch.verticalAlign,
								horizontalAlign: '',
								style: { ...style, typography },
							});
						}}
					/>
				</PanelBody>
			</InspectorControls>
			<StylePanel
				clientId={clientId}
				tokens={attributes.styleTokens}
				onChange={(styleTokens) => setAttributes({ styleTokens })}
			/>
			<div {...props}>
				<span
					id={`mtb-cell-position-${clientId}`}
					className="modular-table-blocks-editor__position"
				>
					{description}
				</span>
				{props.children}
			</div>
		</>
	);
}
