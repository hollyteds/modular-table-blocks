import { allowsCellContentChange, cellContentMode } from './content';

export type ContentNode = {
	clientId: string;
	name: string;
	innerBlocks: ContentNode[];
};
export type ContentSelectors = {
	getBlock: (id: string) => ContentNode | null;
	getBlocks: (root?: string) => ContentNode[];
	getBlockRootClientId: (id: string) => string | null;
};
const array = <T>(value: T | T[] | undefined): T[] => {
	if (value === undefined) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
};

function validTree(block: ContentNode, select: ContentSelectors): boolean {
	const previous = select.getBlock(block.clientId);
	const preserved =
		previous?.name === block.name &&
		previous.innerBlocks.length === block.innerBlocks.length &&
		previous.innerBlocks.every(
			(child, index) =>
				child.clientId === block.innerBlocks[index].clientId &&
				child.name === block.innerBlocks[index].name
		);
	return (
		(block.name !== 'modular-table-blocks/cell' ||
			cellContentMode(block.innerBlocks) !== 'mixed' ||
			preserved) &&
		block.innerBlocks.every((child) => validTree(child, select))
	);
}

export const CONTENT_ACTIONS = [
	'insertBlock',
	'insertBlocks',
	'replaceBlock',
	'replaceBlocks',
	'replaceInnerBlocks',
	'duplicateBlocks',
	'moveBlockToPosition',
	'moveBlocksToPosition',
	'insertDefaultBlock',
	'insertBeforeBlock',
	'insertAfterBlock',
] as const;

// Check a whole operation before dispatching it. In particular, a paste must
// not partially insert an otherwise invalid batch or remove the source first.
export function allowsContentAction(
	action: string,
	args: unknown[],
	select: ContentSelectors,
	defaultBlockName = 'core/paragraph'
): boolean {
	const check = (
		root: string | null | undefined,
		added: ContentNode[],
		removed: string[] = []
	) => {
		if (
			root &&
			select.getBlock(root)?.name === 'modular-table-blocks/cell'
		) {
			const before = select.getBlocks(root);
			return allowsCellContentChange(before, [
				...before.filter((block) => !removed.includes(block.clientId)),
				...added,
			]);
		}
		return true;
	};
	const ids = () => array(args[0] as string | string[]);
	switch (action) {
		case 'insertBlock':
		case 'insertBlocks': {
			const added = array(args[0] as ContentNode | ContentNode[]);
			return (
				added.every((block) => validTree(block, select)) &&
				check(args[2] as string, added)
			);
		}
		case 'replaceBlock':
		case 'replaceBlocks': {
			const added = array(args[1] as ContentNode | ContentNode[]);
			return (
				added.every((block) => validTree(block, select)) &&
				ids().every((id) =>
					check(select.getBlockRootClientId(id), added, ids())
				)
			);
		}
		case 'replaceInnerBlocks': {
			const root = args[0] as string;
			const added = args[1] as ContentNode[];
			return (
				added.every((block) => validTree(block, select)) &&
				check(
					root,
					added,
					select.getBlocks(root).map((block) => block.clientId)
				)
			);
		}
		case 'duplicateBlocks':
			return ids().every((id) => {
				const block = select.getBlock(id);
				return (
					!block ||
					(validTree(block, select) &&
						check(
							select.getBlockRootClientId(id),
							ids()
								.map((key) => select.getBlock(key))
								.filter((item): item is ContentNode => !!item)
						))
				);
			});
		case 'moveBlockToPosition':
		case 'moveBlocksToPosition':
			return check(
				args[2] as string,
				ids()
					.map((id) => select.getBlock(id))
					.filter((block): block is ContentNode => !!block),
				ids()
			);
		case 'insertDefaultBlock':
			return check(args[1] as string, [
				{ name: defaultBlockName, clientId: '', innerBlocks: [] },
			]);
		case 'insertBeforeBlock':
		case 'insertAfterBlock':
			return check(select.getBlockRootClientId(ids()[0]), [
				{ name: defaultBlockName, clientId: '', innerBlocks: [] },
			]);
		default:
			// Loading, Undo/Redo and removal must preserve existing content.
			return true;
	}
}
