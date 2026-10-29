import { validateGrid } from './build-grid';
import { headerCount, placements, tableGrid } from './layout';
import type { BlockTree } from './operations';

/**
 * Plan a single attribute update without replacing content or block identities.
 * @param table
 * @param enabled
 */
export function planHeaderRow(
	table: BlockTree,
	enabled: boolean
): Record<string, Record<string, unknown>> {
	if (validateGrid(tableGrid(table)).length || !table.innerBlocks.length) {
		throw new Error('invalid-grid');
	}
	if (enabled && placements(table).some((p) => p.row === 0 && p.height > 1)) {
		throw new Error('section-boundary');
	}
	const updates: Record<string, Record<string, unknown>> = {
		[table.clientId]: { headerRows: enabled ? 1 : 0 },
	};
	const count = enabled ? 1 : Math.max(1, headerCount(table));
	for (const p of placements(table).filter(
		(position) => position.row < count
	)) {
		updates[p.cell.clientId] = {
			tag: enabled ? 'th' : 'td',
			scope: enabled ? 'col' : '',
		};
	}
	return updates;
}
