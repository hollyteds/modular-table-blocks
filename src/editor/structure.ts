import { materializeBlock } from './materialize';
import { planOperation } from '../grid/operations';
import type { BlockTree, TableOperation } from '../grid/operations';

type EditorBlock = ReturnType<typeof materializeBlock>;
export interface StructureEditor {
	getBlock: (id: string) => BlockTree | null;
	replaceInnerBlocks: (
		id: string,
		blocks: EditorBlock[],
		select: boolean
	) => unknown;
	replaceBlocks: (id: string, blocks: EditorBlock[]) => unknown;
	selectBlock: (id: string) => unknown;
}
export type StructureResult =
	| { status: 'stale' }
	| { status: 'error'; code: string }
	| { status: 'confirmation'; source: BlockTree; operation: TableOperation }
	| { status: 'applied' };

// Revalidate a confirmation and commit a complete plan as one editor change.
export function applyStructureOperation(
	editor: StructureEditor,
	source: BlockTree,
	selectedId: string,
	operation: TableOperation,
	approvedDeletion = false
): StructureResult {
	const latest = editor.getBlock(source.clientId);
	if (!latest || latest !== source) {
		return { status: 'stale' };
	}
	const plan = planOperation(latest, operation);
	if (plan.errors.length || !plan.changes) {
		return { status: 'error', code: plan.errors[0] ?? 'operation-failed' };
	}
	if (plan.warnings.includes('merge-delete-content') && !approvedDeletion) {
		return { status: 'error', code: 'merge-delete-content' };
	}
	if (plan.warnings.length && !approvedDeletion) {
		return { status: 'confirmation', source: latest, operation };
	}
	if (operation.type === 'mergeCells') {
		// Only merging owns the lock exception: keep the table and origin intact.
		editor.replaceInnerBlocks(
			latest.clientId,
			plan.changes.innerBlocks.map(materializeBlock),
			false
		);
		editor.selectBlock(selectedId);
	} else {
		editor.replaceBlocks(latest.clientId, [
			materializeBlock({ ...plan.changes, clientId: '' }),
		]);
		if (
			plan.changes.innerBlocks.some(
				(cell) => cell.clientId === selectedId
			)
		) {
			editor.selectBlock(selectedId);
		}
	}
	return { status: 'applied' };
}
