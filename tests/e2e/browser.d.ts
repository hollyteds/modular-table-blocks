import type * as Blocks from '@wordpress/blocks';

export interface TestBlock {
	clientId: string;
	name: string;
	attributes: Record<string, unknown>;
	innerBlocks: TestBlock[];
	isValid: boolean;
}

interface Selectors {
	canInsertBlockType: (name: string, rootClientId?: string) => boolean;
	canRemoveBlocks: (clientIds: string[]) => boolean;
	getSettings: () => Record<string, unknown>;
	getBlocks: ( root?: string ) => TestBlock[];
	getSelectedBlockClientId: () => string | null;
	getEditedPostContent: () => string;
	getCurrentPostId: () => number;
	isSavingPost: () => boolean;
	isEditedPostDirty: () => boolean;
}

interface Actions {
	updateEditorSettings: (settings: Record<string, unknown>) => void;
	duplicateBlocks: (ids: string[]) => void;
	replaceBlocks: (ids: string[], blocks: unknown[]) => void;
	moveBlocksToPosition: (ids: string[], source: string, target: string, index: number) => void;
	removeBlocks: (ids: string[]) => void;
	updateSettings: (settings: Record<string, unknown>) => void;
	replaceInnerBlocks: (clientId: string, blocks: unknown[], updateSelection?: boolean) => void;
	insertBlocks: ( blocks: unknown[], index?: number, rootClientId?: string ) => void;
	resetBlocks: ( blocks: unknown[] ) => void;
	selectBlock: ( clientId: string ) => void;
	updateBlockAttributes: ( clientId: string, attributes: Record<string, unknown> ) => void;
	editPost: ( attributes: Record<string, unknown> ) => void;
	savePost: () => Promise<void>;
	undo: () => void;
	redo: () => void;
}

declare global {
	interface Window {
 mtbMergeCells: (table: TestBlock, row: number, column: number, height: number, width: number) => TestBlock[];
 mtbRows: (table: TestBlock) => TestBlock[][];
		mtbCreateTable: (attributes: Record<string, unknown>, rows: TestBlock[][]) => ReturnType<typeof Blocks.createBlock>;
		wp: {
			apiFetch: <T>(options: { path: string; method?: string; data?: Record<string, unknown> }) => Promise<T>;
			blocks: typeof Blocks;
			i18n: typeof import('@wordpress/i18n');
			blockEditor: typeof import('@wordpress/block-editor');
			element: typeof import('@wordpress/element');
			data: { select: ( store: string ) => Selectors; dispatch: ( store: string ) => Actions };
		};
	}
}
