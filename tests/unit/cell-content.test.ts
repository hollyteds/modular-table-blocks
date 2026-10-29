import {
	CELL_TEXT_BLOCK,
	allowsCellContentChange,
	cellContentMode,
} from '../../src/content';
import { allowsContentAction } from '../../src/cell-content-rules';
import type { ContentNode } from '../../src/cell-content-rules';

const node = (
	name: string,
	clientId: string,
	innerBlocks: ContentNode[] = []
): ContentNode => ({ name, clientId, innerBlocks });
const text = node(CELL_TEXT_BLOCK, 'text');
const paragraph = node('core/paragraph', 'paragraph');
const cell = (innerBlocks: ContentNode[]) =>
	node('modular-table-blocks/cell', 'cell', innerBlocks);
const selectors = (blocks: ContentNode[]) => ({
	getBlock: (id: string) =>
		id === 'cell'
			? cell(blocks)
			: (blocks.find((block) => block.clientId === id) ?? null),
	getBlocks: () => blocks,
	getBlockRootClientId: () => 'cell',
});

test('cell modes are local to each cell and permit normal block collections', () => {
	expect(cellContentMode([])).toBe('empty');
	expect(cellContentMode([text])).toBe('text');
	expect(cellContentMode([paragraph, paragraph])).toBe('blocks');
	expect(cellContentMode([text, text])).toBe('mixed');
	expect(cellContentMode([text, paragraph])).toBe('mixed');
	expect(allowsCellContentChange([text], [paragraph])).toBe(true);
	expect(allowsCellContentChange([text], [text, paragraph])).toBe(false);
	expect(
		allowsCellContentChange(
			[text, text, paragraph],
			[text, paragraph, paragraph]
		)
	).toBe(true);
	expect(
		allowsCellContentChange([text, paragraph], [text, paragraph, paragraph])
	).toBe(false);
});

test('whole paste batches and duplication are checked before insertion without mutation', () => {
	const blocks = [text];
	const before = JSON.stringify(blocks);
	for (const action of ['insertBlock', 'insertBlocks']) {
		expect(
			allowsContentAction(
				action,
				[[paragraph], 0, 'cell'],
				selectors(blocks)
			)
		).toBe(false);
	}
	expect(
		allowsContentAction(
			'insertBlocks',
			[[text, text], 0, 'cell'],
			selectors([])
		)
	).toBe(false);
	expect(
		allowsContentAction(
			'insertBlocks',
			[[paragraph, text], 0, 'cell'],
			selectors([])
		)
	).toBe(false);
	expect(
		allowsContentAction(
			'insertBlocks',
			[[paragraph, paragraph], 0, 'cell'],
			selectors([])
		)
	).toBe(true);
	expect(
		allowsContentAction('duplicateBlocks', [['text']], selectors(blocks))
	).toBe(false);
	expect(
		allowsContentAction(
			'duplicateBlocks',
			[['paragraph']],
			selectors([paragraph])
		)
	).toBe(true);
	expect(JSON.stringify(blocks)).toBe(before);
});

test('replacement permits paragraph transforms and repairs, but not mixed results', () => {
	expect(
		allowsContentAction(
			'replaceBlocks',
			[['text'], [paragraph]],
			selectors([text])
		)
	).toBe(true);
	expect(
		allowsContentAction(
			'replaceBlocks',
			[['text'], [text, paragraph]],
			selectors([text])
		)
	).toBe(false);
	expect(
		allowsContentAction(
			'replaceInnerBlocks',
			['cell', [text, paragraph]],
			selectors([])
		)
	).toBe(false);
	expect(
		allowsContentAction(
			'replaceInnerBlocks',
			['cell', [paragraph, paragraph]],
			selectors([text])
		)
	).toBe(true);
	expect(
		allowsContentAction(
			'replaceBlocks',
			[['text'], [paragraph]],
			selectors([text, { ...text, clientId: 'text2' }, paragraph])
		)
	).toBe(true);
});

test('moves check the destination after excluding moved blocks, and keep sources intact', () => {
	const select = selectors([text]);
	expect(
		allowsContentAction(
			'moveBlocksToPosition',
			[['text'], 'cell', 'cell', 0],
			select
		)
	).toBe(true);
	const fromElsewhere = {
		...select,
		getBlock: (id: string) =>
			id === 'paragraph' ? paragraph : select.getBlock(id),
	};
	expect(
		allowsContentAction(
			'moveBlockToPosition',
			['paragraph', 'source', 'cell', 0],
			fromElsewhere
		)
	).toBe(false);
	expect(select.getBlocks()).toEqual([text]);
	for (const action of [
		'resetBlocks',
		'removeBlocks',
		'undo',
		'redo',
		'updateBlockAttributes',
	]) {
		expect(allowsContentAction(action, [], select)).toBe(true);
	}
});

test('default insertion and pasted cell trees follow the same policy', () => {
	const select = selectors([text]);
	expect(
		allowsContentAction('insertDefaultBlock', [{}, 'cell'], select)
	).toBe(false);
	expect(allowsContentAction('insertAfterBlock', ['text'], select)).toBe(
		false
	);
	expect(allowsContentAction('insertBeforeBlock', ['text'], select)).toBe(
		false
	);
	expect(
		allowsContentAction(
			'insertBlocks',
			[[cell([text, text])], 0, 'table'],
			select
		)
	).toBe(false);
	expect(
		allowsContentAction(
			'insertBlocks',
			[[cell([text])], 0, 'table'],
			select
		)
	).toBe(true);
});

test('structural table updates preserve imported mixed cells without permitting new mixed trees', () => {
	const mixed = cell([text, paragraph]);
	const select = {
		getBlock: (id: string) => (id === 'cell' ? mixed : null),
		getBlocks: () => [mixed],
		getBlockRootClientId: () => 'table',
	};
	expect(
		allowsContentAction('replaceInnerBlocks', ['table', [mixed]], select)
	).toBe(true);
	const fresh = { ...mixed, clientId: 'new-cell' };
	expect(
		allowsContentAction('insertBlocks', [[fresh], 0, 'table'], select)
	).toBe(false);
	expect(mixed.innerBlocks).toEqual([text, paragraph]);
});
