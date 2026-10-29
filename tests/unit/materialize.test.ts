import { registerBlockType, unregisterBlockType } from '@wordpress/blocks';
import { materializeBlock } from '../../src/editor/materialize';
import type { BlockTree } from '../../src/grid/operations';

const name = 'mtb-test/materialize';
beforeAll(() => {
	registerBlockType(name, {
		apiVersion: 3,
		title: 'Test',
		category: 'text',
		attributes: { content: { type: 'string' } },
		save: () => null,
	});
});
afterAll(() => unregisterBlockType(name));

function block(clientId = '', isValid?: boolean): BlockTree {
	return {
		name,
		clientId,
		...(isValid === undefined ? {} : { isValid }),
		attributes: { content: 'text' },
		innerBlocks: [],
	};
}
test('retained nested blocks preserve IDs, RichText objects, locks and invalid state', () => {
	const richText = { toString: () => '<strong>value</strong>' };
	const text = block('text', false);
	text.attributes = { content: richText, lock: { remove: true } };
	const source = { ...block('cell'), innerBlocks: [text] };
	const result = materializeBlock(source);
	expect(result.clientId).toBe('cell');
	expect(result.innerBlocks[0].clientId).toBe('text');
	expect(result.innerBlocks[0].isValid).toBe(false);
	expect(result.innerBlocks[0].attributes.content).toBe(richText);
	expect(result.innerBlocks[0].attributes.lock).toBe(text.attributes.lock);
	expect(source.innerBlocks[0]).toBe(text);
});
test('duplicated nodes get distinct IDs without sanitizing RichText attributes', () => {
	const richText = { toString: () => 'duplicate' };
	const source = block('', true);
	source.attributes.content = richText;
	source.innerBlocks = [block('', true)];
	const first = materializeBlock(source);
	const second = materializeBlock(source);
	expect(first.clientId).toBeTruthy();
	expect(first.clientId).not.toBe(second.clientId);
	expect(first.innerBlocks[0].clientId).not.toBe(
		second.innerBlocks[0].clientId
	);
	expect(first.attributes.content).toBe(richText);
	expect(source.clientId).toBe('');
});
test('new nodes are created through registered schemas and retained children keep their IDs', () => {
	const source = { ...block(), innerBlocks: [block('retained')] };
	const result = materializeBlock(source);
	expect(result.clientId).toBeTruthy();
	expect(result.attributes.content).toBe('text');
	expect(result.innerBlocks[0].clientId).toBe('retained');
});
