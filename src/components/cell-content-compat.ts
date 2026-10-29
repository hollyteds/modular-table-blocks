import { use } from '@wordpress/data';
import type { useRegistry } from '@wordpress/data';
import { getDefaultBlockName } from '@wordpress/blocks';
import { addFilter } from '@wordpress/hooks';
import { __ } from '@wordpress/i18n';
import { CELL_TEXT_BLOCK } from '../content';
import { allowsContentAction, CONTENT_ACTIONS } from '../cell-content-rules';
import type { ContentSelectors } from '../cell-content-rules';

// Public registry plugins intercept the editor's structural entry points.
// Core's thunks call other actions internally, so duplicate/default/move entry
// points are checked too. No store mutation, rollback or undo-stack rewriting.
use((registry: ReturnType<typeof useRegistry>) => {
	const cache = new WeakMap<object, object>();
	return {
		dispatch(store: string | { name: string }) {
			const name = typeof store === 'string' ? store : store.name;
			const actions = registry.dispatch(name);
			if (name !== 'core/block-editor') {
				return actions;
			}
			if (!cache.has(actions)) {
				const guarded = { ...actions };
				for (const key of CONTENT_ACTIONS) {
					const original = actions[key];
					if (typeof original !== 'function') {
						continue;
					}
					guarded[key] = (...args: unknown[]) => {
						const selectors = registry.select(
							'core/block-editor'
						) as unknown as ContentSelectors;
						if (
							!allowsContentAction(
								key,
								args,
								selectors,
								getDefaultBlockName() ?? 'core/paragraph'
							)
						) {
							registry
								.dispatch('core/notices')
								.createNotice(
									'warning',
									__(
										'Use one Cell text block on its own, or other blocks without Cell text. Convert Cell text to a paragraph to add more blocks.',
										'modular-table-blocks'
									),
									{
										id: 'modular-table-blocks-cell-content',
										type: 'snackbar',
									}
								);
							return Promise.resolve();
						}
						return original(...args);
					};
				}
				cache.set(actions, guarded);
			}
			return cache.get(actions) as typeof actions;
		},
	};
}, {});

// Gutenberg combines child.parent and allowedBlocks with OR, so a dynamic
// allowedBlocks list alone cannot hide Cell text in an occupied cell. This
// unstable filter is isolated here and covered on WP 6.6 and latest. Paragraph
// remains a valid transform target; atomic action checks reject extra siblings.
addFilter(
	'blockEditor.__unstableCanInsertBlockType',
	'modular-table-blocks/cell-content',
	(
		allowed: boolean,
		type: { name: string },
		root: string | null,
		selectors: ContentSelectors
	) => {
		if (!allowed || type.name !== CELL_TEXT_BLOCK || !root) {
			return allowed;
		}
		const parent = selectors.getBlock(root);
		return (
			parent?.name !== 'modular-table-blocks/cell' ||
			!parent.innerBlocks.length
		);
	}
);
