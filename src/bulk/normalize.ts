import type { BlockTree } from '../grid/operations';
import { inheritedCellBackground } from '../styles/background';
import {
	fieldPolicy,
	commonValue,
	localFieldValue,
	resolvedFieldValue,
} from './fields';
import type { BulkField, BulkPatch, BulkUpdates } from './types';

type NormalizeContext = {
	table: BlockTree;
	cells: Map<string, BlockTree>;
	updates: BulkUpdates;
	apply: (
		id: string,
		original: Record<string, unknown>,
		patch: BulkPatch
	) => void;
};

// Background inheritance depends on each logical origin, including TH/stripe rules.
function normalizeBackground(
	{ table, cells, updates, apply }: NormalizeContext,
	field: BulkField
) {
	const parent = {
		...table.attributes,
		...updates[table.clientId],
	};
	const values = Array.from(cells.values(), (cell) =>
		resolvedFieldValue(
			{ ...table, attributes: parent },
			{ ...cell.attributes, ...updates[cell.clientId] },
			field
		)
	);
	const common = commonValue(values);
	if (
		!common.mixed &&
		common.value !== undefined &&
		common.value !== localFieldValue(parent, field)
	) {
		apply(table.clientId, table.attributes, {
			[field]: common.value,
		});
	}
	const nextParent = {
		...table.attributes,
		...updates[table.clientId],
	};
	for (const [index, cell] of Array.from(cells.values()).entries()) {
		const current = {
			...cell.attributes,
			...updates[cell.clientId],
		};
		const inherited = inheritedCellBackground(nextParent, current);
		const value = values[index];
		// Hoisting must not reveal a header/stripe or change an unset cell.
		if (value !== inherited) {
			apply(cell.clientId, cell.attributes, {
				[field]: value,
			});
		} else if (localFieldValue(current, field) !== undefined) {
			apply(cell.clientId, cell.attributes, {
				[field]: undefined,
			});
		}
	}
}

// Compare only saved values; computed CSS and unit conversion never affect storage.
function normalizeInherited(
	{ table, cells, updates, apply }: NormalizeContext,
	field: BulkField
) {
	const tableValue = localFieldValue(
		{ ...table.attributes, ...updates[table.clientId] },
		field
	);
	const values = Array.from(
		cells.values(),
		(cell) =>
			localFieldValue(
				{ ...cell.attributes, ...updates[cell.clientId] },
				field
			) ?? tableValue
	);
	if (!values.length) {
		return;
	}
	const common = commonValue(values);
	if (!common.mixed && common.value !== tableValue) {
		apply(table.clientId, table.attributes, {
			[field]: common.value,
		});
	}
	// Mixed values keep the parent default. Even then, matching local
	// values can inherit it instead of persisting redundant overrides.
	const inherited = common.mixed ? tableValue : common.value;
	for (const cell of cells.values()) {
		const local = localFieldValue(
			{ ...cell.attributes, ...updates[cell.clientId] },
			field
		);
		if (local !== undefined && local === inherited) {
			apply(cell.clientId, cell.attributes, {
				[field]: undefined,
			});
		}
	}
}

export function normalizeEditedFields(
	table: BlockTree,
	cells: Map<string, BlockTree>,
	updates: BulkUpdates,
	fields: Iterable<BulkField>,
	apply: NormalizeContext['apply']
) {
	const context = { table, cells, updates, apply };
	for (const field of fields) {
		switch (fieldPolicy(field).normalization) {
			case 'background':
				normalizeBackground(context, field);
				break;
			case 'uniform':
				normalizeInherited(context, field);
				break;
			case 'none':
				break;
		}
	}
}
