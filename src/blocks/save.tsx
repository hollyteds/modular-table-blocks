import { InnerBlocks } from '@wordpress/block-editor';

// All three dynamic blocks must serialize their children, never save null.
export default function Save() {
	return <InnerBlocks.Content />;
}
