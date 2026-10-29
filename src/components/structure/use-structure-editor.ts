import { store as blockEditorStore } from '@wordpress/block-editor';
import { useRegistry, useSelect } from '@wordpress/data';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyStructureOperation } from '../../editor/structure';
import { placements } from '../../grid/layout';
import { mergeOptions } from '../../grid/merge-options';
import { planOperation, structureErrors } from '../../grid/operations';
import type { BlockTree, TableOperation } from '../../grid/operations';
import { structureMessages } from './messages';

export function useStructureEditor(clientId: string) {
	const registry = useRegistry();
	const table = useSelect(
		(select) => {
			const store = select(blockEditorStore);
			if (!store.isBlockSelected(clientId)) {
				return null;
			}
			const id =
				store.getBlockName(clientId) === 'modular-table-blocks/table'
					? clientId
					: store.getBlockParentsByBlockName(
							clientId,
							'modular-table-blocks/table'
						)[0];
			return id ? (store.getBlock(id) as BlockTree | null) : null;
		},
		[clientId]
	);
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState<{
		operation: TableOperation;
		source: BlockTree;
	} | null>(null);
	const [merge, setMerge] = useState<BlockTree | null>(null);
	const mergeButton = useRef<HTMLButtonElement>(null);
	const restoreMergeFocus = useRef(false);
	useEffect(() => {
		if (!merge && restoreMergeFocus.current) {
			restoreMergeFocus.current = false;
			mergeButton.current?.focus();
		}
	}, [merge]);
	const availableMerge = useMemo(
		() => (table ? mergeOptions(table, clientId) : null),
		[table, clientId]
	);
	const located = useMemo(() => (table ? placements(table) : []), [table]);
	const origin = located.find((p) => p.cell.clientId === clientId);
	const rowIndex = origin?.row ?? -1;
	const columnIndex = origin?.column ?? -1;
	const cellIndex = origin
		? located
				.filter((p) => p.row === rowIndex)
				.findIndex((p) => p.cell.clientId === clientId)
		: -1;
	const reason = table ? structureErrors(table)[0] : undefined;
	const position = reason ? undefined : origin;
	const plannedErrors = new Map<string, string[]>();
	const issues = (operation: TableOperation) => {
		if (reason || !table) {
			return [reason ?? 'invalid-grid'];
		}
		const key = JSON.stringify(operation);
		if (!plannedErrors.has(key)) {
			plannedErrors.set(key, planOperation(table, operation).errors);
		}
		return plannedErrors.get(key)!;
	};
	const rowMoves: TableOperation[] = [
		{ type: 'moveRow', index: rowIndex, destination: rowIndex - 1 },
		{ type: 'moveRow', index: rowIndex, destination: rowIndex + 1 },
	];
	const columnMoves: TableOperation[] = [
		{
			type: 'moveColumn',
			index: columnIndex,
			destination: columnIndex - 1,
		},
		{
			type: 'moveColumn',
			index: columnIndex,
			destination: columnIndex + 1,
		},
	];
	const rowReason =
		rowIndex >= 0 &&
		!reason &&
		[
			{ type: 'duplicateRow', index: rowIndex } as TableOperation,
			...rowMoves,
		].some((op) => issues(op).includes('ambiguous-row-operation'))
			? 'ambiguous-row-operation'
			: undefined;
	const columnReason =
		columnIndex >= 0 &&
		!reason &&
		[
			{ type: 'duplicateColumn', index: columnIndex } as TableOperation,
			...columnMoves,
		].some((op) => issues(op).includes('ambiguous-column-operation'))
			? 'ambiguous-column-operation'
			: undefined;
	const execute = (
		operation: TableOperation,
		confirmedSource?: BlockTree,
		approvedDeletion = false
	) => {
		if (!table) {
			return;
		}
		const actions = registry.dispatch(blockEditorStore);
		const result = applyStructureOperation(
			{
				getBlock: (id) =>
					registry
						.select(blockEditorStore)
						.getBlock(id) as BlockTree | null,
				replaceBlocks: (id, blocks) =>
					actions.replaceBlocks(id, blocks),
				replaceInnerBlocks: (id, blocks, select) =>
					actions.replaceInnerBlocks(id, blocks, select),
				selectBlock: (id) => actions.selectBlock(id),
			},
			confirmedSource ?? table,
			clientId,
			operation,
			approvedDeletion
		);
		if (result.status === 'stale') {
			setPending(null);
			setMessage(
				__(
					'The table changed while confirmation was open. Review the operation again.',
					'modular-table-blocks'
				)
			);
		} else if (result.status === 'error') {
			setMessage(
				result.code === 'merge-delete-content'
					? __(
							'Confirm deletion of other cell contents before merging.',
							'modular-table-blocks'
						)
					: (structureMessages[result.code] ??
							__(
								'The operation could not be applied.',
								'modular-table-blocks'
							))
			);
		} else if (result.status === 'confirmation') {
			setPending({ source: result.source, operation: result.operation });
		} else {
			setPending(null);
			return true;
		}
	};
	const closeMerge = () => {
		restoreMergeFocus.current = true;
		setMerge(null);
	};
	return {
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
	};
}
