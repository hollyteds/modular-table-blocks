import { BulkError, bulkFailure } from '../../src/bulk/errors';
import { validatePatch } from '../../src/bulk/fields';
import { checkedSelection } from '../../src/bulk/selection';
import type { BlockTree } from '../../src/grid/operations';

test('known bulk failures retain their reason and original exception', () => {
	const cause = new BulkError('stale-structure');
	expect(cause.message).toBe('stale-structure');
	expect(bulkFailure(cause)).toEqual({ code: 'stale-structure', cause });
});
test('unexpected exceptions remain available for investigation', () => {
	const cause = new TypeError('unexpected failure');
	expect(bulkFailure(cause)).toEqual({ code: 'unexpected', cause });
});
test('invalid values and empty selections remain distinct', () => {
	try {
		validatePatch({ verticalAlign: 'invalid' });
		throw new Error('Expected validation to refuse');
	} catch (cause) {
		expect(bulkFailure(cause).code).toBe('invalid-value');
	}
	try {
		checkedSelection(
			{
				attributes: { columns: [], rowCount: 0 },
				innerBlocks: [],
			} as unknown as BlockTree,
			{ mode: 'all', indices: [], all: false }
		);
		throw new Error('Expected selection to refuse');
	} catch (cause) {
		expect(bulkFailure(cause).code).toBe('empty-selection');
	}
});
