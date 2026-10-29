import type { BlockTree } from '../grid/operations';
import type { Placement } from '../grid/layout';
import { borderStyleDefaults } from '../styles/native-box';
import { sides, sideKey } from '../styles/sides';
import type { Side, SideKind, SideValues } from '../styles/sides';
import type { StyleTokens } from '../styles/tokens';
import { selectionSides, cellsForField } from './selection';
import {
	cellFields,
	fieldPolicy,
	commonValue,
	fieldValue,
	resolvedFieldValue,
	owns,
} from './fields';
import type { BulkPatch, BulkSelection } from './types';

export function commonBorderStyleDefaults(
	table: BlockTree,
	cells: Placement[],
	selection?: BulkSelection
): SideValues {
	const resolved = cells.map((p) =>
		borderStyleDefaults([
			table.attributes.styleTokens as StyleTokens | undefined,
			p.cell.attributes.styleTokens as StyleTokens | undefined,
		])
	);
	return Object.fromEntries(
		sides.flatMap((side) => {
			const value = commonValue(
				resolved.flatMap((styles, index) =>
					!selection ||
					selectionSides(cells[index], selection).includes(side)
						? [styles[side]]
						: []
				)
			).value;
			return value === undefined ? [] : [[side, value]];
		})
	);
}

export function commonTokens(
	cells: Placement[],
	patch: BulkPatch,
	selection?: BulkSelection,
	table?: BlockTree
): StyleTokens {
	const tokens: StyleTokens = {};
	for (const field of cellFields) {
		if (!fieldPolicy(field).token) {
			continue;
		}
		const value = owns(patch, field)
			? patch[field]
			: commonValue(
					(selection
						? cellsForField(cells, selection, field)
						: cells
					).map((p) =>
						table
							? resolvedFieldValue(
									table,
									p.cell.attributes,
									field
								)
							: fieldValue(p.cell.attributes, field)
					)
				).value;
		if (value === undefined) {
			continue;
		}
		if (field.includes('.')) {
			const [kind, side] = field.split('.') as [SideKind, Side];
			tokens[sideKey(kind, side)] = value;
		} else {
			tokens[field as 'fontSize' | 'lineHeight' | 'cellBackgroundColor'] =
				value;
		}
	}
	return tokens;
}
