import { TABLE_LIMITS } from '../../grid/limits';
import type { BlockEditProps } from '@wordpress/blocks';
import type { MouseEvent } from 'react';
import { materializeBlock } from '../../editor/materialize';
import {
	InspectorControls,
	RichText,
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
import { useDispatch, useRegistry, useSelect } from '@wordpress/data';
import {
	lazy,
	Suspense,
	useCallback,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { placements, headerCount } from '../../grid/layout';
import { planHeaderRow } from '../../grid/header-row';
import {
	updateBulkAttributes,
	ToggleGroupControl,
	ToggleGroupControlOption,
} from '../../components/style-compat';
import { TableLayout } from '../../grid/layout-context';
import { columnTemplate, columnWidthMode } from '../../styles/columns';
import type { ColumnWidthMode } from '../../styles/columns';
import TableWidthControl from '../../components/table-width-control';
import TableBackgroundControl from '../../components/table-background-control';
import TableBorderLayoutControl from '../../components/table-border-layout-control';
import { isBorderCollapse } from '../../styles/border-layout';
import type { BorderCollapse } from '../../styles/border-layout';

import { editorStyle, hasExplicitFontWeight } from '../../styles/native';
import type { NativeStyleAttributes } from '../../styles/native';
import type { StyleTokens } from '../../styles/tokens';
import StructureControls from '../../components/structure-controls';
import { planOperation, structureErrors } from '../../grid/operations';
import type { BlockTree } from '../../grid/operations';
import ColumnWidthControl from '../../components/column-width-control';
import BulkCellModal from '../../components/bulk-cell-control';
import {
	capturePreviewEnvironment,
	rebasePreviewEnvironment,
} from '../../styles/bulk-preview';
import type { PreviewEnvironment } from '../../styles/bulk-preview';
import { captionIsEnabled } from '../../caption';
import type { CaptionAttributes } from '../../caption';
import TableCaptionControl from '../../components/table-caption-control';
import TableSettingsSection from '../../components/table-settings-section';
import { resetTableSection, tableSectionHasValue } from '../../table-settings';
import type { TableSettingsSection as SettingsSectionKey } from '../../table-settings';

// Import parsing is editor-only and loaded when the user opens the dialog.
const ImportModal = lazy(
	() =>
		import(
			/* webpackChunkName: "table-import" */ '../../components/import-modal'
		)
);

export type TableAttributes = NativeStyleAttributes &
	CaptionAttributes & {
		columns: Record<string, unknown>[];
		columnWidthMode?: ColumnWidthMode;
		stripeMode?: 'none' | 'rows' | 'columns';
		rowCount: number;
		styleTokens?: StyleTokens;
		headerRows: number;
		responsiveMode: 'none' | 'scroll';
		borderCollapse?: BorderCollapse;
	};

export default function TableEdit({
	attributes,
	setAttributes,
	clientId,
}: BlockEditProps<TableAttributes>) {
	const [initialRows, setInitialRows] = useState('3');
	const registry = useRegistry();
	const [initialColumns, setInitialColumns] = useState('3');
	const [headerError, setHeaderError] = useState(false);
	const [bulkSource, setBulkSource] = useState<BlockTree | null>(null);
	const importOpener = useRef<HTMLElement | null>(null);
	const [importSession, setImportSession] = useState<{
		source: BlockTree;
		row: number;
		column: number;
	} | null>(null);
	const openImport = useCallback(
		(row: number, column: number, opener?: HTMLElement) => {
			const source = registry
				.select(blockEditorStore)
				.getBlock(clientId) as BlockTree | null;
			if (source) {
				importOpener.current = opener ?? null;
				setImportSession({ source, row, column });
			}
		},
		[registry, clientId]
	);
	const [bulkEnvironment, setBulkEnvironment] = useState<PreviewEnvironment>({
		table: {},
		blocks: {},
		fontSizes: {},
	});
	const bulkButton = useRef<HTMLButtonElement>(null);
	const tableElement = useRef<HTMLDivElement>(null);
	const cells = useSelect(
		(select) => select(blockEditorStore).getBlocks(clientId),
		[clientId]
	);
	const { replaceBlocks } = useDispatch(blockEditorStore);
	const layout = useMemo(() => {
		const table = {
			clientId,
			name: 'modular-table-blocks/table',
			attributes,
			innerBlocks: cells,
		};
		const errors = structureErrors(table);
		return {
			onImport: openImport,
			headerRows: headerCount(table),
			background: attributes,
			verticalAlign: attributes.verticalAlign,
			valid: errors.length === 0,
			cells: errors.length ? [] : placements(table),
			errors,
		};
	}, [cells, attributes, clientId, openImport]);
	const showCaption = captionIsEnabled(attributes);
	const captionSide = attributes.captionSide === 'bottom' ? 'bottom' : 'top';
	const caption = showCaption ? (
		<RichText
			tagName="p"
			identifier="caption"
			className="modular-table-blocks-editor__caption"
			aria-label={__('Caption', 'modular-table-blocks')}
			placeholder={__('Write caption…', 'modular-table-blocks')}
			value={attributes.caption}
			data-mtb-caption-side={attributes.captionSide}
			style={{ textAlign: attributes.captionAlign }}
			onChange={(value) =>
				setAttributes({ caption: value, captionEnabled: true })
			}
		/>
	) : null;
	const blockProps = useBlockProps({
		ref: tableElement,
		className: `modular-table-blocks-editor${attributes.responsiveMode === 'scroll' ? ' modular-table-blocks-editor--scroll' : ''}${layout.valid && attributes.style?.dimensions?.minHeight ? ' modular-table-blocks-editor--min-height' : ''}`,
		'data-mtb-caption': showCaption ? captionSide : undefined,
		style: editorStyle(attributes),
		'data-mtb-font-weight': hasExplicitFontWeight(attributes)
			? 'inherit'
			: undefined,
		'data-mtb-border-collapse': isBorderCollapse(attributes.borderCollapse)
			? attributes.borderCollapse
			: undefined,
	});
	const innerProps = useInnerBlocksProps(
		{
			className: `modular-table-blocks-editor__cells${layout.valid ? ' modular-table-blocks-editor__cells--grid' : ''}`,
			style: layout.valid
				? {
						gridTemplateColumns: columnTemplate(
							attributes.columns,
							attributes.columnWidthMode
						),
						gridTemplateRows: `repeat(${attributes.rowCount}, minmax(4rem, auto))`,
					}
				: undefined,
		},
		{
			allowedBlocks: ['modular-table-blocks/cell'],
			templateLock: 'all',
			renderAppender: () => null,
		}
	);
	const rowCount = Number(initialRows);
	const columnCount = Number(initialColumns);
	const valid =
		Number.isInteger(rowCount) &&
		rowCount >= 1 &&
		rowCount <= TABLE_LIMITS.initialRows &&
		Number.isInteger(columnCount) &&
		columnCount >= 1 &&
		columnCount <= TABLE_LIMITS.initialColumns;
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
			replaceBlocks(clientId, [
				materializeBlock({ ...plan.changes, clientId: '' }),
			]);
		}
	};
	const resetSection = (section: SettingsSectionKey) => {
		const current = registry
			.select(blockEditorStore)
			.getBlockAttributes(clientId) as TableAttributes;
		if (current) {
			updateBulkAttributes(registry, {
				[clientId]: resetTableSection(current, section),
			});
		}
	};
	return (
		<>
			<StructureControls clientId={clientId} onImport={openImport} />
			{importSession && (
				<Suspense fallback={null}>
					<ImportModal
						source={importSession.source}
						initialRow={importSession.row}
						initialColumn={importSession.column}
						onClose={() => {
							setImportSession(null);
							if (!importOpener.current?.isConnected) {
								tableElement.current?.focus();
							}
						}}
					/>
				</Suspense>
			)}
			{bulkSource && (
				<BulkCellModal
					source={bulkSource}
					environment={bulkEnvironment}
					onApplied={(table, patch) => {
						setBulkEnvironment((previous) =>
							rebasePreviewEnvironment(previous, patch)
						);
						setBulkSource(table);
					}}
					onClose={() => {
						setBulkSource(null);
						if (!bulkButton.current) {
							tableElement.current?.focus();
						}
					}}
				/>
			)}
			<InspectorControls>
				<PanelBody
					title={__('Table settings', 'modular-table-blocks')}
					className="modular-table-blocks-table-settings"
				>
					<ToggleControl
						label={__(
							'Use first row as headers (TH)',
							'modular-table-blocks'
						)}
						help={__(
							'Replaces TH/TD settings in the first row.',
							'modular-table-blocks'
						)}
						checked={attributes.headerRows > 0}
						disabled={!layout.valid || !cells.length}
						onChange={(checked) => {
							try {
								const table = registry
									.select(blockEditorStore)
									.getBlock(clientId);
								if (!table) {
									return;
								}
								updateBulkAttributes(
									registry,
									planHeaderRow(table, checked)
								);
								setHeaderError(false);
							} catch {
								setHeaderError(true);
							}
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
						checked={attributes.responsiveMode === 'scroll'}
						onChange={(checked) =>
							setAttributes({
								responsiveMode: checked ? 'scroll' : 'none',
							})
						}
					/>
					<Button
						className="modular-table-blocks-table-settings__bulk"
						ref={bulkButton}
						variant="secondary"
						disabled={!layout.valid || !cells.length}
						onClick={() => {
							const table = {
								clientId,
								name: 'modular-table-blocks/table',
								attributes,
								innerBlocks: cells,
							};
							setBulkEnvironment(
								capturePreviewEnvironment(
									tableElement.current,
									table
								)
							);
							setBulkSource(table);
						}}
					>
						{__('Bulk edit cells', 'modular-table-blocks')}
					</Button>
					<hr className="modular-table-blocks-table-settings__divider" />
					<TableSettingsSection
						id={`${clientId}-columns`}
						label={__('Column widths', 'modular-table-blocks')}
						hasValue={tableSectionHasValue(attributes, 'columns')}
						onReset={() => resetSection('columns')}
					>
						<ToggleGroupControl
							label={__(
								'Column width mode',
								'modular-table-blocks'
							)}
							hideLabelFromVision
							value={columnWidthMode(attributes)}
							isBlock
							onChange={(mode) => {
								if (
									mode === 'equal' ||
									mode === 'auto' ||
									mode === 'custom'
								) {
									setAttributes({ columnWidthMode: mode });
								}
							}}
						>
							<ToggleGroupControlOption
								value="equal"
								label={__(
									'Equal width',
									'modular-table-blocks'
								)}
							/>
							<ToggleGroupControlOption
								value="auto"
								label={__(
									'Automatic width',
									'modular-table-blocks'
								)}
							/>
							<ToggleGroupControlOption
								value="custom"
								label={__(
									'Custom widths',
									'modular-table-blocks'
								)}
							/>
						</ToggleGroupControl>
						{columnWidthMode(attributes) === 'custom' &&
							attributes.columns.map((column, index) => (
								<ColumnWidthControl
									key={index}
									index={index}
									value={column?.width}
									onChange={(width) =>
										setAttributes({
											columns: attributes.columns.map(
												(item, i) => {
													if (i !== index) {
														return item;
													}
													const next = { ...item };
													if (width) {
														next.width = width;
													} else {
														delete next.width;
													}
													return next;
												}
											),
										})
									}
								/>
							))}
					</TableSettingsSection>
					<hr className="modular-table-blocks-table-settings__divider" />
					<TableSettingsSection
						id={`${clientId}-spacing`}
						label={__('Cell spacing', 'modular-table-blocks')}
						hasValue={tableSectionHasValue(attributes, 'spacing')}
						onReset={() => resetSection('spacing')}
					>
						<TableBorderLayoutControl
							value={attributes.borderCollapse}
							tokens={attributes.styleTokens}
							onChange={setAttributes}
						/>
					</TableSettingsSection>
					<hr className="modular-table-blocks-table-settings__divider" />
					<TableSettingsSection
						id={`${clientId}-width`}
						label={__('Table width', 'modular-table-blocks')}
						hasValue={tableSectionHasValue(attributes, 'width')}
						onReset={() => resetSection('width')}
					>
						<TableWidthControl
							hideLabelFromVision
							tokens={attributes.styleTokens}
							onChange={(styleTokens) =>
								setAttributes({ styleTokens })
							}
						/>
					</TableSettingsSection>
					<hr className="modular-table-blocks-table-settings__divider" />
					<TableSettingsSection
						id={`${clientId}-caption`}
						label={__('Caption', 'modular-table-blocks')}
						hasValue={tableSectionHasValue(attributes, 'caption')}
						onReset={() => resetSection('caption')}
					>
						<TableCaptionControl
							attributes={attributes}
							onChange={setAttributes}
						/>
					</TableSettingsSection>
				</PanelBody>
			</InspectorControls>
			<TableBackgroundControl
				clientId={clientId}
				stripeMode={attributes.stripeMode}
				tokens={attributes.styleTokens}
				onChange={setAttributes}
			/>
			<TableLayout.Provider value={layout}>
				<div {...blockProps}>
					{cells.length === 0 ? (
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
								max={TABLE_LIMITS.initialRows}
								label={__('Rows', 'modular-table-blocks')}
								value={initialRows}
								onChange={setInitialRows}
							/>
							<TextControl
								type="number"
								min={1}
								max={TABLE_LIMITS.initialColumns}
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
							<Button
								variant="secondary"
								onClick={(
									event: MouseEvent<HTMLButtonElement>
								) => openImport(0, 0, event.currentTarget)}
							>
								{__('Import data', 'modular-table-blocks')}
							</Button>
						</Placeholder>
					) : (
						<>
							{captionSide === 'top' && caption}
							{errors.length > 0 && (
								<Notice status="warning" isDismissible={false}>
									{__(
										'The table grid is inconsistent. Content is preserved; automatic repair is not available.',
										'modular-table-blocks'
									)}
								</Notice>
							)}
							<div {...innerProps} />
							{captionSide === 'bottom' && caption}
						</>
					)}
				</div>
			</TableLayout.Provider>
		</>
	);
}
