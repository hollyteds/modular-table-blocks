export const CELL_TEXT_BLOCK = 'modular-table-blocks/cell-text';

export const CELL_CONTENT_BLOCKS = [
	CELL_TEXT_BLOCK,
	'core/paragraph',
	'core/list',
	'core/heading',
	'core/image',
	'core/buttons',
];

type ContentBlock = { name: string };

export function cellContentMode(blocks: readonly ContentBlock[]) {
	const texts = blocks.filter(
		(block) => block.name === CELL_TEXT_BLOCK
	).length;
	if (!blocks.length) {
		return 'empty';
	}
	if (!texts) {
		return 'blocks';
	}
	return texts === 1 && blocks.length === 1 ? 'text' : 'mixed';
}

// Imported content is preserved. Converting existing cell text to paragraphs
// may repair it in several steps; no new cell text can be added in that state.
export function allowsCellContentChange(
	before: readonly ContentBlock[],
	after: readonly ContentBlock[]
) {
	return (
		cellContentMode(after) !== 'mixed' ||
		(cellContentMode(before) === 'mixed' &&
			after.filter((block) => block.name === CELL_TEXT_BLOCK).length <
				before.filter((block) => block.name === CELL_TEXT_BLOCK).length)
	);
}
