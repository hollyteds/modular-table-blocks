import type { BlockEditProps } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
} from '@wordpress/block-editor';
import { PanelBody, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useContext } from '@wordpress/element';
import { TableLayout } from '../../grid/layout-context';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import { CELL_CONTENT_BLOCKS } from '../../content';

export type CellAttributes = {
	tag: 'td' | 'th';
	scope: '' | 'col' | 'row' | 'colgroup' | 'rowgroup';
	colSpan: number;
	rowSpan: number;
	styleTokens?: StyleTokens;
	horizontalAlign: '' | 'left' | 'center' | 'right';
	verticalAlign: 'top' | 'middle' | 'bottom';
};

export default function CellEdit({
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<CellAttributes>) {
	const layout = useContext(TableLayout);
	const position = layout.cells.find((p) => p.cell.clientId === clientId);
	const props = useInnerBlocksProps(
		useBlockProps({
			className: `modular-table-blocks-editor__cell${attributes.tag === 'th' ? ' modular-table-blocks-editor__cell--header' : ''}`,
			style: {
				...tokenStyle(attributes.styleTokens),
				gridColumn: position
					? `${position.column + 1} / span ${position.width}`
					: undefined,
				gridRow: position ? `1 / span ${position.height}` : undefined,
				textAlign: attributes.horizontalAlign || undefined,
				alignContent: (
					{ top: 'start', middle: 'center', bottom: 'end' } as const
				)[attributes.verticalAlign],
			},
		}),
		{ allowedBlocks: CELL_CONTENT_BLOCKS, templateLock: false }
	);
	return (
		<>
			<StructureControls clientId={clientId} />
			<InspectorControls>
				<PanelBody title={__('Cell settings', 'modular-table-blocks')}>
					<SelectControl
						label={__(
							'Horizontal alignment',
							'modular-table-blocks'
						)}
						value={attributes.horizontalAlign}
						options={[
							{
								label: __('Inherit', 'modular-table-blocks'),
								value: '',
							},
							{
								label: __('Left', 'modular-table-blocks'),
								value: 'left',
							},
							{
								label: __('Center', 'modular-table-blocks'),
								value: 'center',
							},
							{
								label: __('Right', 'modular-table-blocks'),
								value: 'right',
							},
						]}
						onChange={(
							horizontalAlign: CellAttributes['horizontalAlign']
						) => setAttributes({ horizontalAlign })}
					/>
					<SelectControl
						label={__('Vertical alignment', 'modular-table-blocks')}
						value={attributes.verticalAlign}
						options={[
							{
								label: __('Top', 'modular-table-blocks'),
								value: 'top',
							},
							{
								label: __('Middle', 'modular-table-blocks'),
								value: 'middle',
							},
							{
								label: __('Bottom', 'modular-table-blocks'),
								value: 'bottom',
							},
						]}
						onChange={(
							verticalAlign: CellAttributes['verticalAlign']
						) => setAttributes({ verticalAlign })}
					/>
					<SelectControl
						label={__('Cell type', 'modular-table-blocks')}
						value={attributes.tag}
						options={[
							{
								label: __('Data cell', 'modular-table-blocks'),
								value: 'td',
							},
							{
								label: __(
									'Header cell',
									'modular-table-blocks'
								),
								value: 'th',
							},
						]}
						onChange={(tag: 'td' | 'th') => setAttributes({ tag })}
					/>
					{attributes.tag === 'th' && (
						<SelectControl
							label={__(
								'Header association',
								'modular-table-blocks'
							)}
							value={attributes.scope}
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
				<StylePanel
					tokens={attributes.styleTokens}
					onChange={(styleTokens) => setAttributes({ styleTokens })}
				/>
			</InspectorControls>
			<div {...props} />
		</>
	);
}
