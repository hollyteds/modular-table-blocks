import type { BlockEditProps } from '@wordpress/blocks';
import { createBlock } from '@wordpress/blocks';
import {
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import {
	Button,
	Notice,
	PanelBody,
	Placeholder,
	TextControl,
} from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { buildGrid, validateGrid } from '../../grid/build-grid';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';

export type TableAttributes = {
	columns: Record<string, unknown>[];
	caption: string;
	styleTokens?: StyleTokens;
};

export default function TableEdit({
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<TableAttributes>) {
	const [initialRows, setInitialRows] = useState('3');
	const [initialColumns, setInitialColumns] = useState('3');
	const rows = useSelect(
		(select) => select(blockEditorStore).getBlocks(clientId),
		[clientId]
	);
	const { replaceInnerBlocks } = useDispatch(blockEditorStore);
	const blockProps = useBlockProps({
		className: 'modular-table-blocks-editor',
		style: tokenStyle(attributes.styleTokens),
	});
	const innerProps = useInnerBlocksProps(
		{ className: 'modular-table-blocks-editor__rows' },
		{
			allowedBlocks: ['modular-table-blocks/row'],
			templateLock: 'all',
			renderAppender: () => null,
		}
	);
	const rowCount = Number(initialRows);
	const columnCount = Number(initialColumns);
	const valid =
		Number.isInteger(rowCount) &&
		rowCount >= 1 &&
		rowCount <= 20 &&
		Number.isInteger(columnCount) &&
		columnCount >= 1 &&
		columnCount <= 20;
	const errors = validateGrid(
		buildGrid(
			rows.map((row) =>
				row.innerBlocks.map((cell) => ({
					clientId: cell.clientId,
					colSpan:
						typeof cell.attributes.colSpan === 'number'
							? cell.attributes.colSpan
							: NaN,
					rowSpan:
						typeof cell.attributes.rowSpan === 'number'
							? cell.attributes.rowSpan
							: NaN,
				}))
			),
			attributes.columns.length
		)
	);
	const insert = () => {
		if (!valid) {
			return;
		}
		setAttributes({
			columns: Array.from({ length: columnCount }, () => ({})),
		});
		replaceInnerBlocks(
			clientId,
			Array.from({ length: rowCount }, () =>
				createBlock(
					'modular-table-blocks/row',
					{},
					Array.from({ length: columnCount }, () =>
						createBlock('modular-table-blocks/cell', {}, [
							createBlock('core/paragraph'),
						])
					)
				)
			),
			false
		);
	};
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Table settings', 'modular-table-blocks')}>
					<TextControl
						label={__('Caption', 'modular-table-blocks')}
						value={attributes.caption}
						onChange={(caption) => setAttributes({ caption })}
					/>
				</PanelBody>
				<StylePanel
					table
					tokens={attributes.styleTokens}
					onChange={(styleTokens) => setAttributes({ styleTokens })}
				/>
			</InspectorControls>
			<div {...blockProps}>
				{rows.length === 0 ? (
					<Placeholder
						label={__('Modular Table', 'modular-table-blocks')}
						instructions={__(
							'Choose 1–20 rows and columns. Structure editing is not available in this technical preview.',
							'modular-table-blocks'
						)}
					>
						<TextControl
							type="number"
							min={1}
							max={20}
							label={__('Rows', 'modular-table-blocks')}
							value={initialRows}
							onChange={setInitialRows}
						/>
						<TextControl
							type="number"
							min={1}
							max={20}
							label={__('Columns', 'modular-table-blocks')}
							value={initialColumns}
							onChange={setInitialColumns}
						/>
						<Button
							variant="primary"
							disabled={!valid}
							onClick={insert}
						>
							{__('Create table', 'modular-table-blocks')}
						</Button>
					</Placeholder>
				) : (
					<>
						<p className="modular-table-blocks-editor__label">
							{attributes.caption ||
								__('Modular Table', 'modular-table-blocks')}
						</p>
						{errors.length > 0 && (
							<Notice status="warning" isDismissible={false}>
								{__(
									'The table grid is inconsistent. Content is preserved; automatic repair is not available.',
									'modular-table-blocks'
								)}
							</Notice>
						)}
						<div {...innerProps} />
					</>
				)}
			</div>
		</>
	);
}
