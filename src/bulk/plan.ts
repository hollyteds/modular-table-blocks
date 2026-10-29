import { BulkError } from './errors';
import type { BlockTree } from '../grid/operations';
import { placements } from '../grid/layout';
import { cellSemantics } from '../grid/cell-type';
import { inheritedCellBackground } from '../styles/background';
import { checkStructure } from './selection';
import {
	fieldPolicy,
	localFieldValue,
	patchAttributes,
	validatePatch,
} from './fields';
import { emptyBulkDraft, stageBulkPatch } from './draft';
import { normalizeEditedFields } from './normalize';
import type { BulkDraft, BulkField, BulkPatch, BulkSelection } from './types';

function compileBulkDraft(
	table: BlockTree,
	draft: BulkDraft,
	normalize = false
): Record<string, Record<string, unknown>> {
	const cells = new Map(
		placements(table).map((p) => [p.cell.clientId, p.cell])
	);
	const updates: Record<string, Record<string, unknown>> = {};
	const apply = (
		id: string,
		original: Record<string, unknown>,
		patch: BulkPatch
	) => {
		const current = { ...original, ...updates[id] };
		if (
			Object.entries(patch).every(
				([field, value]) =>
					value === undefined &&
					localFieldValue(current, field as BulkField) === undefined
			)
		) {
			return;
		}
		updates[id] = {
			...updates[id],
			...patchAttributes({ ...original, ...updates[id] }, patch),
		};
	};
	for (const edit of draft.edits) {
		validatePatch({ [edit.field]: edit.value });
		if (!edit.targets.length || edit.targets.some((id) => !cells.has(id))) {
			throw new BulkError('invalid-selection');
		}
		if (
			fieldPolicy(edit.field).storage === 'cell' &&
			(edit.global ||
				edit.targets.some(
					(id) =>
						cellSemantics(
							table.attributes,
							cells.get(id)!.attributes
						).isManagedHeader
				))
		) {
			throw new BulkError('invalid-selection');
		}
		if (edit.global) {
			if (new Set(edit.targets).size !== cells.size) {
				throw new BulkError('invalid-selection');
			}
			apply(table.clientId, table.attributes, {
				[edit.field]: edit.value,
			});
		}
		for (const id of edit.targets) {
			const ruleOverride =
				edit.global &&
				fieldPolicy(edit.field).normalization === 'background' &&
				edit.value !== undefined &&
				inheritedCellBackground(
					{ ...table.attributes, ...updates[table.clientId] },
					cells.get(id)!.attributes
				) !== edit.value;
			apply(id, cells.get(id)!.attributes, {
				[edit.field]:
					edit.global && !ruleOverride ? undefined : edit.value,
			});
		}
	}
	if (normalize) {
		normalizeEditedFields(
			table,
			cells,
			updates,
			new Set(draft.edits.map((edit) => edit.field)),
			apply
		);
	}
	return updates;
}

export function projectBulkDraft(
	table: BlockTree,
	draft: BulkDraft
): BlockTree {
	return projectBulkPlan(table, compileBulkDraft(table, draft));
}

export function projectBulkPlan(
	table: BlockTree,
	updates: Record<string, Record<string, unknown>>
): BlockTree {
	return {
		...table,
		attributes: { ...table.attributes, ...updates[table.clientId] },
		innerBlocks: table.innerBlocks.map((cell) =>
			updates[cell.clientId]
				? {
						...cell,
						attributes: {
							...cell.attributes,
							...updates[cell.clientId],
						},
					}
				: cell
		),
	};
}

export function planBulkDraft(
	table: BlockTree,
	signature: string,
	draft: BulkDraft
): Record<string, Record<string, unknown>> {
	checkStructure(table, signature);
	return compileBulkDraft(table, draft, true);
}

export function planBulkUpdate(
	table: BlockTree,
	signature: string,
	selection: BulkSelection,
	patch: BulkPatch
): Record<string, Record<string, unknown>> {
	return planBulkDraft(
		table,
		signature,
		stageBulkPatch(table, emptyBulkDraft(), selection, patch)
	);
}
