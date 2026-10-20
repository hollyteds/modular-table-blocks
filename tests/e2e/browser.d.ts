import type * as Blocks from '@wordpress/blocks';

export interface TestBlock {
	clientId: string;
	name: string;
	attributes: Record<string, unknown>;
	innerBlocks: TestBlock[];
	isValid: boolean;
}

interface Selectors {
	getBlocks: ( root?: string ) => TestBlock[];
	getSelectedBlockClientId: () => string | null;
	getEditedPostContent: () => string;
	getCurrentPostId: () => number;
	isSavingPost: () => boolean;
	isEditedPostDirty: () => boolean;
}

interface Actions {
	insertBlocks: ( blocks: unknown[] ) => void;
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
		wp: {
			blocks: typeof Blocks;
			i18n: typeof import('@wordpress/i18n');
			blockEditor: typeof import('@wordpress/block-editor');
			element: typeof import('@wordpress/element');
			data: { select: ( store: string ) => Selectors; dispatch: ( store: string ) => Actions };
		};
	}
}
