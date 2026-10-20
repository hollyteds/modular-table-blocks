import type { BlockEditProps } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
} from '@wordpress/block-editor';
import { PanelBody, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';

export type CellAttributes = {
	tag: 'td' | 'th';
	scope: '' | 'col' | 'row' | 'colgroup' | 'rowgroup';
	colSpan: number;
	rowSpan: number;
	styleTokens?: StyleTokens;
};

export default function CellEdit({
	attributes,
	setAttributes,
}: BlockEditProps<CellAttributes>) {
	const props = useInnerBlocksProps(
		useBlockProps({
			className: 'modular-table-blocks-editor__cell',
			style: tokenStyle(attributes.styleTokens),
		}),
		{ allowedBlocks: ['core/paragraph'], templateLock: false }
	);
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Cell settings', 'modular-table-blocks')}>
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
