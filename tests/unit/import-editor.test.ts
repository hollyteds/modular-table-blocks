import { validateImport } from '../../src/import/editor';
import type { ImportEditor } from '../../src/import/editor';
import { planImport } from '../../src/import/plan';
import { parseText } from '../../src/import/parse-text';
import type { BlockTree } from '../../src/grid/operations';

const options = {
	mode: 'overwrite' as const,
	row: 0,
	column: 0,
	firstRowHeader: false,
};
function fixture() {
	const source = planImport(
		{
			clientId: '',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		parseText('a,b'),
		{ ...options, mode: 'new' }
	).table;
	source.clientId = 'table';
	source.innerBlocks.forEach((cell, i) => {
		cell.clientId = `cell-${i}`;
		cell.innerBlocks[0].clientId = `text-${i}`;
	});
	const all = [
		source,
		...source.innerBlocks,
		...source.innerBlocks.flatMap((cell) => cell.innerBlocks),
	];
	const editor: ImportEditor = {
		getBlock: (id) => all.find((block) => block.clientId === id) ?? null,
		getBlockRootClientId: () => null,
		getBlockIndex: () => 0,
		getTemplateLock: (id) => (id === 'table' ? 'all' : false),
		getBlockEditingMode: () => 'default',
		canRemoveBlocks: (ids) => !ids.some((id) => id.startsWith('cell-')),
		canInsertBlockType: () => true,
	};
	return { source, editor };
}
test('internal table grid guard allows replacing contents while retaining cells', () => {
	const { source, editor } = fixture();
	expect(
		validateImport(editor, source, parseText('x'), options).targetIds
	).toEqual(['cell-0']);
});
test.each(['all', 'insert', 'contentOnly'])(
	'ancestor template lock %s refuses even if individual removal is allowed',
	(lock) => {
		const { source, editor } = fixture();
		editor.getTemplateLock = (id) => (id === undefined ? lock : false);
		expect(() =>
			validateImport(editor, source, parseText('x'), options)
		).toThrow('locked');
	}
);
test('cell lock and descendant removal restrictions refuse', () => {
	const { source, editor } = fixture();
	editor.canRemoveBlocks = (ids) => !ids.includes('text-0');
	expect(() =>
		validateImport(editor, source, parseText('x'), options)
	).toThrow('locked');
	source.innerBlocks[0].attributes.lock = { remove: true };
	editor.canRemoveBlocks = () => true;
	expect(() =>
		validateImport(editor, source, parseText('x'), options)
	).toThrow('locked');
});
test('table removal lock, editing mode and insertion restrictions refuse', () => {
	for (const change of [
		(e: ImportEditor) => {
			e.canRemoveBlocks = () => false;
		},
		(e: ImportEditor) => {
			e.getBlockEditingMode = () => 'disabled';
		},
		(e: ImportEditor) => {
			e.canInsertBlockType = () => false;
		},
	]) {
		const { source, editor } = fixture();
		change(editor);
		expect(() =>
			validateImport(editor, source, parseText('x'), options)
		).toThrow('locked');
	}
});
test('new sibling import retains a locked existing table, but requires parent insertion rights', () => {
	const { source, editor } = fixture();
	source.attributes.lock = { remove: true };
	editor.canRemoveBlocks = () => false;
	expect(
		validateImport(editor, source, parseText('x'), {
			...options,
			mode: 'new',
		}).table.innerBlocks
	).toHaveLength(1);
	editor.canInsertBlockType = () => false;
	expect(() =>
		validateImport(editor, source, parseText('x'), {
			...options,
			mode: 'new',
		})
	).toThrow('locked');
});
test('a changed or deleted source is never applied under an old confirmation', () => {
	const { source, editor } = fixture();
	editor.getBlock = () => ({ ...source }) as BlockTree;
	expect(() =>
		validateImport(editor, source, parseText('x'), options)
	).toThrow('stale');
	editor.getBlock = () => null;
	expect(() =>
		validateImport(editor, source, parseText('x'), options)
	).toThrow('stale');
});
