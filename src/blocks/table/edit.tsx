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
	ToggleControl,
} from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { validateGrid } from '../../grid/build-grid';
import { tableGrid, placements } from '../../grid/layout';
import { TableLayout } from '../../grid/layout-context';
import { columnTemplate } from '../../styles/columns';
import StylePanel from '../../components/style-panel';
import { tokenStyle } from '../../styles/tokens';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import { planOperation } from '../../grid/operations';
import type { BlockTree } from '../../grid/operations';
import ColumnWidthControl from '../../components/column-width-control';

export type TableAttributes = {
	columns: Record<string, unknown>[];
	caption: string;
	styleTokens?: StyleTokens;
	headerRows: number;
	responsiveMode: 'none' | 'scroll';
};

export default function TableEdit({
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<TableAttributes>) {
	const [initialRows, setInitialRows] = useState('3');
	const [initialColumns, setInitialColumns] = useState('3');
	const [headerError, setHeaderError] = useState(false);
	const rows = useSelect(
		(select) => select(blockEditorStore).getBlocks(clientId),
		[clientId]
	);
	const { replaceBlocks } = useDispatch(blockEditorStore);
	const blockProps = useBlockProps({
		className: `modular-table-blocks-editor${attributes.responsiveMode === 'scroll' ? ' modular-table-blocks-editor--scroll' : ''}`,
		style: tokenStyle(attributes.styleTokens),
	});
	const layout = useMemo(() => {
		const table = {
			clientId,
			name: 'modular-table-blocks/table',
			attributes,
			innerBlocks: rows,
		};
		const errors = validateGrid(tableGrid(table));
		return {
			valid: errors.length === 0,
			cells: errors.length ? [] : placements(table),
			errors,
		};
	}, [rows, attributes, clientId]);
	const innerProps = useInnerBlocksProps(
		{
			className: `modular-table-blocks-editor__rows${layout.valid ? ' modular-table-blocks-editor__rows--grid' : ''}`,
			style: layout.valid
				? { gridTemplateColumns: columnTemplate(attributes.columns) }
				: undefined,
		},
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
	const errors = layout.errors;
	const insert = () => {
		if (!valid) {
			return;
		}
		const plan = planOperation(
			{
				clientId,
				name: 'modular-table-blocks/table',
				attributes,
				innerBlocks: [],
			},
			{ type: 'initialize', rows: rowCount, columns: columnCount }
		);
		if (plan.changes) {
			const makeBlock = (
				block: BlockTree
			): ReturnType<typeof createBlock> =>
				createBlock(
					block.name,
					block.attributes,
					block.innerBlocks.map(makeBlock)
				);
			replaceBlocks(clientId, [makeBlock(plan.changes)]);
		}
	};
	return (
		<>
			<StructureControls clientId={clientId} />
			<InspectorControls>
				<PanelBody title={__('Table settings', 'modular-table-blocks')}>
					<TextControl
						label={__('Caption', 'modular-table-blocks')}
						value={attributes.caption}
						onChange={(caption) => setAttributes({ caption })}
					/>
					<ToggleControl
						label={__('Header row', 'modular-table-blocks')}
						help={__(
							'The first row is displayed as column headers. Individual cell settings are preserved.',
							'modular-table-blocks'
						)}
						checked={attributes.headerRows > 0}
						onChange={(checked) => {
							if (
								checked &&
								layout.cells.some(
									(p) => p.row === 0 && p.height > 1
								)
							) {
								setHeaderError(true);
								return;
							}
							setHeaderError(false);
							setAttributes({ headerRows: checked ? 1 : 0 });
						}}
					/>
					{headerError && (
						<Notice status="warning" isDismissible={false}>
							{__(
								'Split cells crossing the first row before enabling the header row.',
								'modular-table-blocks'
							)}
						</Notice>
					)}
					<ToggleControl
						label={__(
							'Horizontal scrolling',
							'modular-table-blocks'
						)}
						help={__(
							'Adds a focusable scroll container for wide tables.',
							'modular-table-blocks'
						)}
						checked={attributes.responsiveMode === 'scroll'}
						onChange={(checked) =>
							setAttributes({
								responsiveMode: checked ? 'scroll' : 'none',
							})
						}
					/>
				</PanelBody>
				<PanelBody
					title={__('Column widths', 'modular-table-blocks')}
					initialOpen={false}
				>
					{attributes.columns.map((column, index) => (
						<ColumnWidthControl
							key={index}
							index={index}
							value={column?.width}
							onChange={(width) =>
								setAttributes({
									columns: attributes.columns.map(
										(item, i) =>
											i === index
												? { ...item, width }
												: item
									),
								})
							}
						/>
					))}
				</PanelBody>
				<StylePanel
					table
					tokens={attributes.styleTokens}
					onChange={(styleTokens) => setAttributes({ styleTokens })}
				/>
			</InspectorControls>
			<TableLayout.Provider value={layout}>
				<div {...blockProps}>
					{rows.length === 0 ? (
						<Placeholder
							label={__('Modular Table', 'modular-table-blocks')}
							instructions={__(
								'Choose 1–20 rows and columns.',
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
			</TableLayout.Provider>
		</>
	);
}
