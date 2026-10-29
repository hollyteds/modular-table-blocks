import { icons } from '../icons';
import { BlockControls, InspectorControls } from '@wordpress/block-editor';
import {
	Button,
	Modal,
	Notice,
	PanelBody,
	ToolbarDropdownMenu,
	ToolbarButton,
	Icon,
} from '@wordpress/components';
import { useContext } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import type { ComponentProps, MouseEvent } from 'react';
import type { TableOperation } from '../grid/operations';
import MergeCellModal from './merge-cell-modal';
import { TableLayout } from '../grid/layout-context';
import { useStructureEditor } from './structure/use-structure-editor';
import { structureMessages as errors } from './structure/messages';

export default function StructureControls({
	clientId,
	onImport,
}: {
	clientId: string;
	onImport?: (row: number, column: number, opener?: HTMLElement) => void;
}) {
	const context = useContext(TableLayout);
	const requestImport = onImport ?? context.onImport;
	const {
		table,
		message,
		setMessage,
		pending,
		setPending,
		merge,
		setMerge,
		mergeButton,
		availableMerge,
		closeMerge,
		rowIndex,
		columnIndex,
		cellIndex,
		reason,
		position,
		rowMoves,
		columnMoves,
		rowReason,
		columnReason,
		issues,
		execute,
	} = useStructureEditor(clientId);
	if (!table || !table.innerBlocks.length) {
		return null;
	}
	const tableSelected = clientId === table.clientId;
	const isMerged = !!position && (position.width > 1 || position.height > 1);
	const makeControl = (
		title: string,
		icon: ComponentProps<typeof Icon>['icon'],
		operation: TableOperation
	) => ({
		title,
		label: title,
		icon,
		onClick: () => {
			execute(operation);
		},
		isDisabled: issues(operation).length > 0,
	});
	const controls = tableSelected
		? [
				makeControl(
					__('Add row at end', 'modular-table-blocks'),
					icons.insertRowBelow,
					{
						type: 'insertRow',
						index: Number(table.attributes.rowCount),
					}
				),
				makeControl(
					__('Add column at end', 'modular-table-blocks'),
					icons.insertColumnAfter,
					{
						type: 'insertColumn',
						index: (table.attributes.columns as unknown[]).length,
					}
				),
			]
		: [
				makeControl(
					__('Insert row above', 'modular-table-blocks'),
					icons.insertRowAbove,
					{ type: 'insertRow', index: rowIndex }
				),
				makeControl(
					__('Insert row below', 'modular-table-blocks'),
					icons.insertRowBelow,
					{ type: 'insertRow', index: rowIndex + 1 }
				),
				makeControl(
					__('Duplicate row', 'modular-table-blocks'),
					icons.duplicateRow,
					{ type: 'duplicateRow', index: rowIndex }
				),
				makeControl(
					__('Delete row', 'modular-table-blocks'),
					icons.deleteRow,
					{
						type: 'deleteRow',
						index: rowIndex,
					}
				),
				makeControl(
					__('Insert column before', 'modular-table-blocks'),
					icons.insertColumnBefore,
					{ type: 'insertColumn', index: columnIndex }
				),
				makeControl(
					__('Insert column after', 'modular-table-blocks'),
					icons.insertColumnAfter,
					{
						type: 'insertColumn',
						index: position
							? position.column + position.width
							: columnIndex + 1,
					}
				),
				makeControl(
					__('Duplicate column', 'modular-table-blocks'),
					icons.duplicateColumn,
					{ type: 'duplicateColumn', index: columnIndex }
				),
				makeControl(
					__('Delete column', 'modular-table-blocks'),
					icons.deleteColumn,
					{
						type: 'deleteColumn',
						index: columnIndex,
					}
				),
			];
	const moveControls =
		rowIndex < 0
			? []
			: [
					makeControl(
						__('Move row up', 'modular-table-blocks'),
						icons.moveRowUp,
						rowMoves[0]
					),
					makeControl(
						__('Move row down', 'modular-table-blocks'),
						icons.moveRowDown,
						rowMoves[1]
					),
					makeControl(
						__('Move column left', 'modular-table-blocks'),
						icons.moveColumnLeft,
						columnMoves[0]
					),
					makeControl(
						__('Move column right', 'modular-table-blocks'),
						icons.moveColumnRight,
						columnMoves[1]
					),
				];
	return (
		<>
			<BlockControls>
				<ToolbarButton
					icon={icons.importTable}
					label={__('Import data', 'modular-table-blocks')}
					onClick={(event: MouseEvent<HTMLButtonElement>) =>
						requestImport?.(
							Math.max(0, rowIndex),
							Math.max(0, columnIndex),
							event.currentTarget
						)
					}
				/>
				<ToolbarDropdownMenu
					icon={icons.tableStructure}
					label={__('Table structure', 'modular-table-blocks')}
					controls={controls}
				/>
				{moveControls.length > 0 && (
					<ToolbarDropdownMenu
						icon={icons.moveRowsColumns}
						label={__(
							'Move rows and columns',
							'modular-table-blocks'
						)}
						controls={moveControls}
						toggleProps={{
							disabled: moveControls.every(
								(control) => control.isDisabled
							),
						}}
					/>
				)}
				{cellIndex >= 0 && (
					<ToolbarButton
						ref={mergeButton}
						label={__(
							'Merge and split cells',
							'modular-table-blocks'
						)}
						icon={icons.mergeSplitCells}
						isPressed={isMerged}
						disabled={
							!!reason ||
							!position ||
							(!isMerged && !availableMerge?.endpoints.length)
						}
						aria-haspopup={isMerged ? undefined : 'dialog'}
						onClick={() => {
							if (isMerged) {
								execute({
									type: 'splitCell',
									row: rowIndex,
									cell: cellIndex,
								});
							} else if (availableMerge?.endpoints.length) {
								setMerge(table);
							}
						}}
					/>
				)}
			</BlockControls>
			{(reason || rowReason || columnReason || message) && (
				<InspectorControls>
					<PanelBody
						title={__('Table structure', 'modular-table-blocks')}
						initialOpen={true}
					>
						{(reason || rowReason) && (
							<Notice status="warning" isDismissible={false}>
								{errors[reason || rowReason!]}
							</Notice>
						)}
						{!reason && columnReason && (
							<Notice status="warning" isDismissible={false}>
								{errors[columnReason]}
							</Notice>
						)}
						{message && (
							<Notice
								status="error"
								onRemove={() => setMessage('')}
							>
								{message}
							</Notice>
						)}
					</PanelBody>
				</InspectorControls>
			)}
			{merge && (
				<MergeCellModal
					source={merge}
					cellId={clientId}
					stale={table !== merge}
					onClose={closeMerge}
					onMerge={(operation, approvedDeletion) => {
						if (execute(operation, merge, approvedDeletion)) {
							setMerge(null);
						}
					}}
				/>
			)}
			{pending && (
				<Modal
					title={__('Delete content?', 'modular-table-blocks')}
					onRequestClose={() => setPending(null)}
				>
					<p>
						{__(
							'This row or column contains content. Deleting it will remove that content. You can undo this change.',
							'modular-table-blocks'
						)}
					</p>
					<Button
						variant="secondary"
						onClick={() => setPending(null)}
					>
						{__('Cancel', 'modular-table-blocks')}
					</Button>
					<Button
						variant="primary"
						isDestructive
						onClick={() =>
							execute(pending.operation, pending.source, true)
						}
					>
						{__('Delete content', 'modular-table-blocks')}
					</Button>
				</Modal>
			)}
		</>
	);
}
