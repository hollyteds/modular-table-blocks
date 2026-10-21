import { cloneBlock, createBlock } from '@wordpress/blocks';
import {
	BlockControls,
	InspectorControls,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import {
	Button,
	Modal,
	Notice,
	PanelBody,
	ToolbarDropdownMenu,
	Icon,
	SelectControl,
} from '@wordpress/components';
import { useRegistry, useSelect } from '@wordpress/data';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import type { ComponentProps } from 'react';
import { planOperation, structureErrors } from '../grid/operations';
import type { BlockTree, TableOperation } from '../grid/operations';
import { placements } from '../grid/layout';

const errors: Record<string, string> = {
	'invalid-grid': __(
		'The table grid is inconsistent. Structure changes are disabled.',
		'modular-table-blocks'
	),
	'ambiguous-row-operation': __(
		'Split cells spanning these rows before moving or duplicating a row.',
		'modular-table-blocks'
	),
	'invalid-selection': __(
		'Choose a rectangular range inside the table.',
		'modular-table-blocks'
	),
	'partial-merge': __(
		'The range must contain at least two complete cells. Include every part of existing merged cells.',
		'modular-table-blocks'
	),
	'not-merged': __('This cell is not merged.', 'modular-table-blocks'),
	'section-boundary': __(
		'This operation would cross a header or section boundary. Split the affected cells first.',
		'modular-table-blocks'
	),
	'invalid-index': __(
		'The selection changed. Select the row or cell again.',
		'modular-table-blocks'
	),
	'last-row': __('The last row cannot be deleted.', 'modular-table-blocks'),
	'last-column': __(
		'The last column cannot be deleted.',
		'modular-table-blocks'
	),
	'size-limit': __(
		'Tables support up to 100 rows and 50 columns.',
		'modular-table-blocks'
	),
};

function materialize(block: BlockTree): ReturnType<typeof createBlock> {
	const children = block.innerBlocks.map(materialize);
	if (block.clientId) {
		return {
			...block,
			isValid: block.isValid ?? true,
			innerBlocks: children,
		};
	}
	if (block.isValid !== undefined) {
		// Existing rich-text attributes are objects in the editor. cloneBlock
		// preserves them; createBlock would sanitize them back to empty strings.
		return cloneBlock(
			{ ...block, isValid: block.isValid, innerBlocks: children },
			undefined,
			children
		);
	}
	return createBlock(block.name, block.attributes, children);
}

export default function StructureControls({ clientId }: { clientId: string }) {
	const registry = useRegistry();
	const snapshot = useSelect(
		(select) => {
			const store = select(blockEditorStore);
			if (!store.isBlockSelected(clientId)) {
				return null;
			}
			const tableId =
				store.getBlockName(clientId) === 'modular-table-blocks/table'
					? clientId
					: store.getBlockParentsByBlockName(
							clientId,
							'modular-table-blocks/table'
						)[0];
			return tableId ? store.getBlock(tableId) : null;
		},
		[clientId]
	);
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState<{
		operation: TableOperation;
		source: BlockTree;
	} | null>(null);
	const [merge, setMerge] = useState<{
		source: BlockTree;
		rows: number;
		columns: number;
	} | null>(null);
	if (!snapshot || snapshot.innerBlocks.length === 0) {
		return null;
	}
	const table = snapshot as BlockTree;
	const rowIndex = table.innerBlocks.findIndex(
		(row) =>
			row.clientId === clientId ||
			row.innerBlocks.some((cell) => cell.clientId === clientId)
	);
	const cellIndex =
		rowIndex < 0
			? -1
			: table.innerBlocks[rowIndex].innerBlocks.findIndex(
					(cell) => cell.clientId === clientId
				);
	const reason = structureErrors(table)[0];
	const position = !reason
		? placements(table).find((p) => p.cell.clientId === clientId)
		: undefined;
	const mergeOperation: TableOperation | undefined =
		merge && position
			? {
					type: 'mergeCells',
					top: position.row,
					left: position.column,
					bottom: position.row + merge.rows - 1,
					right: position.column + merge.columns - 1,
				}
			: undefined;
	const mergeError = mergeOperation
		? planOperation(merge!.source, mergeOperation).errors[0]
		: undefined;
	const rowReason =
		rowIndex >= 0 &&
		!reason &&
		(
			[
				{ type: 'duplicateRow', index: rowIndex },
				{ type: 'moveRow', index: rowIndex, destination: rowIndex - 1 },
				{ type: 'moveRow', index: rowIndex, destination: rowIndex + 1 },
			] as TableOperation[]
		).some((operation) =>
			planOperation(table, operation).errors.includes(
				'ambiguous-row-operation'
			)
		)
			? 'ambiguous-row-operation'
			: undefined;
	const execute = (
		operation: TableOperation,
		confirmedSource?: BlockTree
	) => {
		// Resolve against the live tree immediately before applying, including after a modal.
		const latest = registry
			.select(blockEditorStore)
			.getBlock(table.clientId) as BlockTree | null;
		if (!latest || latest !== (confirmedSource || table)) {
			setPending(null);
			setMessage(
				__(
					'The table changed while confirmation was open. Review the operation again.',
					'modular-table-blocks'
				)
			);
			return;
		}
		const plan = planOperation(latest, operation);
		if (plan.errors.length > 0 || !plan.changes) {
			setMessage(
				errors[plan.errors[0]] ||
					__(
						'The operation could not be applied.',
						'modular-table-blocks'
					)
			);
			return;
		}
		if (plan.warnings.length > 0 && !confirmedSource) {
			setPending({ operation, source: latest });
			return;
		}
		// Replace the owning table once: columns and the tree share one Undo entry.
		const replacement = createBlock(
			latest.name,
			plan.changes.attributes,
			plan.changes.innerBlocks.map(materialize)
		);
		const actions = registry.dispatch(blockEditorStore);
		actions.replaceBlocks(latest.clientId, [replacement]);
		const retained = plan.changes.innerBlocks.find(
			(row) =>
				row.clientId === clientId ||
				row.innerBlocks.some((cell) => cell.clientId === clientId)
		);
		if (retained) {
			actions.selectBlock(clientId);
		}
	};
	const controls: {
		title: string;
		onClick: () => void;
		isDisabled?: boolean;
		icon: ComponentProps<typeof Icon>['icon'];
	}[] = [
		{
			title: __('Add row at end', 'modular-table-blocks'),
			onClick: () =>
				execute({ type: 'insertRow', index: table.innerBlocks.length }),
			icon: 'plus',
			isDisabled: !!reason || table.innerBlocks.length >= 100,
		},
		{
			title: __('Add column at end', 'modular-table-blocks'),
			onClick: () =>
				execute({
					type: 'insertColumn',
					index: (table.attributes.columns as unknown[]).length,
				}),
			icon: 'plus',
			isDisabled:
				!!reason ||
				(table.attributes.columns as unknown[]).length >= 50,
		},
	];
	if (rowIndex >= 0) {
		controls.push(
			{
				title: __('Insert row above', 'modular-table-blocks'),
				onClick: () => execute({ type: 'insertRow', index: rowIndex }),
				icon: 'insert-before',
				isDisabled: !!reason,
			},
			{
				title: __('Insert row below', 'modular-table-blocks'),
				onClick: () =>
					execute({ type: 'insertRow', index: rowIndex + 1 }),
				icon: 'insert-after',
				isDisabled: !!reason,
			},
			{
				title: __('Duplicate row', 'modular-table-blocks'),
				onClick: () =>
					execute({ type: 'duplicateRow', index: rowIndex }),
				icon: 'admin-page',
				isDisabled:
					!!reason ||
					planOperation(table, {
						type: 'duplicateRow',
						index: rowIndex,
					}).errors.length > 0,
			},
			{
				title: __('Move row up', 'modular-table-blocks'),
				onClick: () =>
					execute({
						type: 'moveRow',
						index: rowIndex,
						destination: rowIndex - 1,
					}),
				icon: 'arrow-up-alt2',
				isDisabled:
					!!reason ||
					planOperation(table, {
						type: 'moveRow',
						index: rowIndex,
						destination: rowIndex - 1,
					}).errors.length > 0,
			},
			{
				title: __('Move row down', 'modular-table-blocks'),
				onClick: () =>
					execute({
						type: 'moveRow',
						index: rowIndex,
						destination: rowIndex + 1,
					}),
				icon: 'arrow-down-alt2',
				isDisabled:
					!!reason ||
					planOperation(table, {
						type: 'moveRow',
						index: rowIndex,
						destination: rowIndex + 1,
					}).errors.length > 0,
			},
			{
				title: __('Delete row', 'modular-table-blocks'),
				onClick: () => execute({ type: 'deleteRow', index: rowIndex }),
				icon: 'trash',
				isDisabled: !!reason || table.innerBlocks.length === 1,
			}
		);
	}
	if (cellIndex >= 0) {
		controls.push(
			{
				title: __('Insert column before', 'modular-table-blocks'),
				onClick: () =>
					execute({
						type: 'insertColumn',
						index: position?.column ?? cellIndex,
					}),
				icon: 'insert-before',
				isDisabled: !!reason,
			},
			{
				title: __('Insert column after', 'modular-table-blocks'),
				onClick: () =>
					execute({
						type: 'insertColumn',
						index: position
							? position.column + position.width
							: cellIndex + 1,
					}),
				icon: 'insert-after',
				isDisabled: !!reason,
			},
			{
				title: __('Delete column', 'modular-table-blocks'),
				onClick: () =>
					execute({
						type: 'deleteColumn',
						index: position?.column ?? cellIndex,
					}),
				icon: 'trash',
				isDisabled:
					!!reason ||
					(table.attributes.columns as unknown[]).length === 1,
			}
		);
		controls.push(
			{
				title: __('Merge cells', 'modular-table-blocks'),
				icon: 'editor-table',
				isDisabled: !!reason,
				onClick: () =>
					setMerge({
						source: table,
						rows: position?.height ?? 1,
						columns: position
							? Math.min(
									position.width + 1,
									(table.attributes.columns as unknown[])
										.length - position.column
								)
							: 1,
					}),
			},
			{
				title: __('Split cell', 'modular-table-blocks'),
				icon: 'editor-table',
				isDisabled:
					!!reason ||
					!position ||
					(position.width === 1 && position.height === 1),
				onClick: () =>
					execute({
						type: 'splitCell',
						row: rowIndex,
						cell: cellIndex,
					}),
			}
		);
	}
	return (
		<>
			<BlockControls>
				<ToolbarDropdownMenu
					icon="editor-table"
					label={__('Table structure', 'modular-table-blocks')}
					controls={controls.map((control) => ({
						...control,
						label: control.title,
					}))}
				/>
			</BlockControls>
			{(reason || rowReason || message) && (
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
			{merge && position && (
				<Modal
					title={__('Merge cells', 'modular-table-blocks')}
					onRequestClose={() => setMerge(null)}
				>
					<p>
						{__(
							'All content will be kept in the top-left cell in reading order. The top-left cell settings will be used. Splitting later keeps the content there and creates empty cells.',
							'modular-table-blocks'
						)}
					</p>
					<SelectControl
						label={__('Rows to merge', 'modular-table-blocks')}
						value={String(merge.rows)}
						options={Array.from(
							{ length: table.innerBlocks.length - position.row },
							(_, i) => ({
								label: String(i + 1),
								value: String(i + 1),
							})
						)}
						onChange={(value) =>
							setMerge({ ...merge, rows: Number(value) })
						}
					/>
					<SelectControl
						label={__('Columns to merge', 'modular-table-blocks')}
						value={String(merge.columns)}
						options={Array.from(
							{
								length:
									(table.attributes.columns as unknown[])
										.length - position.column,
							},
							(_, i) => ({
								label: String(i + 1),
								value: String(i + 1),
							})
						)}
						onChange={(value) =>
							setMerge({ ...merge, columns: Number(value) })
						}
					/>
					{mergeError && (
						<Notice status="warning" isDismissible={false}>
							{errors[mergeError]}
						</Notice>
					)}
					<Button variant="secondary" onClick={() => setMerge(null)}>
						{__('Cancel', 'modular-table-blocks')}
					</Button>
					<Button
						variant="primary"
						disabled={!!mergeError}
						onClick={() => {
							if (mergeOperation) {
								execute(mergeOperation, merge.source);
							}
							setMerge(null);
						}}
					>
						{__('Merge cells', 'modular-table-blocks')}
					</Button>
				</Modal>
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
							execute(pending.operation, pending.source)
						}
					>
						{__('Delete content', 'modular-table-blocks')}
					</Button>
				</Modal>
			)}
		</>
	);
}
