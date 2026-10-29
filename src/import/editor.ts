import type { BlockTree } from '../grid/operations';
import { ImportError } from './types';
import { importLocked, planImport } from './plan';
import type { ImportOptions, ImportPlan } from './plan';
import type { ImportData } from './types';

/** Public editor selectors; the installed DefinitelyTyped package omits some exports. */
export interface ImportEditor {
	getBlock: (id: string) => BlockTree | null;
	getBlockRootClientId: (id: string) => string | null;
	getBlockIndex: (id: string, root?: string) => number;
	getTemplateLock: (root?: string) => string | false | undefined;
	getBlockEditingMode: (id: string) => string;
	canRemoveBlocks: (ids: string[]) => boolean;
	canInsertBlockType: (name: string, root?: string) => boolean;
}
function descendants(block: BlockTree): string[] {
	return [block.clientId, ...block.innerBlocks.flatMap(descendants)].filter(
		Boolean
	);
}
export function validateImport(
	editor: ImportEditor,
	source: BlockTree,
	data: ImportData,
	options: ImportOptions
): ImportPlan {
	if (editor.getBlock(source.clientId) !== source) {
		throw new ImportError('stale');
	}
	const root = editor.getBlockRootClientId(source.clientId) ?? undefined;
	const placeholder = !source.innerBlocks.length;
	if (
		editor.getTemplateLock(root) ||
		editor.getBlockEditingMode(source.clientId) !== 'default' ||
		!editor.canInsertBlockType(source.name, root)
	) {
		throw new ImportError('locked');
	}
	const plan = planImport(source, data, options);
	if (options.mode === 'new' && !placeholder) {
		return plan;
	}
	if (
		importLocked({ ...source, innerBlocks: [] }) ||
		!editor.canRemoveBlocks([source.clientId])
	) {
		throw new ImportError('locked');
	}
	for (const id of plan.targetIds) {
		// The table's own InnerBlocks uses templateLock="all" to keep cells in
		// a valid grid. We retain those cells; only their children are replaced.
		// User locks on cells are checked by planImport, and ancestor/template
		// locks are checked above. Do not treat the editor's grid guard as a user lock.
		const cell = editor.getBlock(id);
		if (
			!cell ||
			editor.getBlockEditingMode(id) !== 'default' ||
			editor.getTemplateLock(id) ||
			!editor.canRemoveBlocks(cell.innerBlocks.flatMap(descendants))
		) {
			throw new ImportError(
				'locked',
				Number(cell?.attributes.row),
				Number(cell?.attributes.column)
			);
		}
	}
	return plan;
}
