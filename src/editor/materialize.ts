import { cloneBlock, createBlock } from '@wordpress/blocks';
import type { BlockTree } from '../grid/operations';

/**
 * Plans retain IDs for existing nodes, clear IDs on duplicates (isValid remains),
 * and leave isValid absent for new nodes. Never sanitize existing RichTextData.
 * @param block Planned block, without mutating its attributes or children.
 */
export function materializeBlock(
	block: BlockTree
): ReturnType<typeof createBlock> {
	const innerBlocks = block.innerBlocks.map(materializeBlock);
	if (block.clientId) {
		return { ...block, isValid: block.isValid ?? true, innerBlocks };
	}
	if (block.isValid !== undefined) {
		return cloneBlock(
			{ ...block, isValid: block.isValid, innerBlocks },
			undefined,
			innerBlocks
		);
	}
	return createBlock(block.name, block.attributes, innerBlocks);
}
