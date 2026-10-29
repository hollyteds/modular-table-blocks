import { applyStructureOperation } from '../../src/editor/structure';
import type { StructureEditor } from '../../src/editor/structure';
import { planOperation } from '../../src/grid/operations';
import type { BlockTree } from '../../src/grid/operations';

// Materialization is covered separately using WordPress's actual block registry.
jest.mock('../../src/editor/materialize', () => ({
	materializeBlock: (block: BlockTree) => block,
}));

function fixture() {
	const table = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 2, columns: 2 }
	).changes!;
	table.innerBlocks.forEach((cell, i) => {
		cell.clientId = `cell-${i}`;
	});
	const editor: StructureEditor = {
		getBlock: () => table,
		replaceBlocks: jest.fn(),
		replaceInnerBlocks: jest.fn(),
		selectBlock: jest.fn(),
	};
	return { table, editor };
}
test('stale confirmations never mutate the editor', () => {
	const { table, editor } = fixture();
	editor.getBlock = () => ({ ...table });
	expect(
		applyStructureOperation(
			editor,
			table,
			'cell-0',
			{ type: 'deleteRow', index: 0 },
			true
		)
	).toEqual({ status: 'stale' });
	expect(editor.replaceBlocks).not.toHaveBeenCalled();
	expect(editor.replaceInnerBlocks).not.toHaveBeenCalled();
});
test('destructive row edits require confirmation, then commit one replacement', () => {
	const { table, editor } = fixture();
	table.innerBlocks[0].innerBlocks[0].attributes.content = 'delete me';
	const operation = { type: 'deleteRow' as const, index: 0 };
	expect(
		applyStructureOperation(editor, table, 'cell-0', operation).status
	).toBe('confirmation');
	expect(editor.replaceBlocks).not.toHaveBeenCalled();
	expect(
		applyStructureOperation(editor, table, 'cell-0', operation, true).status
	).toBe('applied');
	expect(editor.replaceBlocks).toHaveBeenCalledTimes(1);
	expect(editor.replaceInnerBlocks).not.toHaveBeenCalled();
});
test('merge requires explicit approval, and only merge replaces the protected inner list', () => {
	const { table, editor } = fixture();
	const operation = {
		type: 'mergeCells' as const,
		top: 0,
		left: 0,
		bottom: 0,
		right: 1,
	};
	expect(applyStructureOperation(editor, table, 'cell-0', operation)).toEqual(
		{ status: 'error', code: 'merge-delete-content' }
	);
	expect(editor.replaceInnerBlocks).not.toHaveBeenCalled();
	expect(
		applyStructureOperation(editor, table, 'cell-0', operation, true).status
	).toBe('applied');
	expect(editor.replaceInnerBlocks).toHaveBeenCalledTimes(1);
	expect(editor.replaceBlocks).not.toHaveBeenCalled();
	expect(editor.selectBlock).toHaveBeenCalledWith('cell-0');
});
test('invalid operations refuse and non-destructive moves preserve the selected cell', () => {
	const { table, editor } = fixture();
	expect(
		applyStructureOperation(editor, table, 'cell-0', {
			type: 'moveColumn',
			index: 0,
			destination: -1,
		}).status
	).toBe('error');
	expect(editor.replaceBlocks).not.toHaveBeenCalled();
	expect(
		applyStructureOperation(editor, table, 'cell-0', {
			type: 'moveColumn',
			index: 0,
			destination: 1,
		}).status
	).toBe('applied');
	expect(editor.replaceBlocks).toHaveBeenCalledTimes(1);
	expect(editor.selectBlock).toHaveBeenCalledWith('cell-0');
});
