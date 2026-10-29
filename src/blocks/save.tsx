import { InnerBlocks } from '@wordpress/block-editor';

// Table and cell containers serialize their children, never save null.
export default function Save() {
	return <InnerBlocks.Content />;
}
