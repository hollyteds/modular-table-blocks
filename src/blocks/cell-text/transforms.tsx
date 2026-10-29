import { createBlock } from '@wordpress/blocks';
import { renderToString } from '@wordpress/element';
import CellTextSave from './save';

export default {
	to: [
		{
			type: 'block' as const,
			blocks: ['core/paragraph'],
			transform: (
				attributes: Record<string, unknown> | Record<string, unknown>[]
			) => {
				const content =
					!Array.isArray(attributes) &&
					typeof attributes.content === 'string'
						? attributes.content
						: '';
				return createBlock('core/paragraph', {
					// Both blocks use RichText HTML; preserve inline formats and breaks.
					content: renderToString(
						<CellTextSave attributes={{ content }} />
					),
				});
			},
		},
	],
};
