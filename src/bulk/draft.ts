import type { BlockTree } from '../grid/operations';
import { placements } from '../grid/layout';
import type { Placement } from '../grid/layout';
import { inheritedCellBackground } from '../styles/background';
import {
	selectedCells,
	checkedSelection,
	cellsForField,
	selectsWholeTable,
} from './selection';
import {
	cellFields,
	fieldPolicy,
	localFieldValue,
	owns,
	validatePatch,
} from './fields';
import type { BulkDraft, BulkField, BulkPatch, BulkSelection } from './types';

export const emptyBulkDraft = (): BulkDraft => ({ edits: [] });

export function draftCellPatches(draft: BulkDraft): Record<string, BulkPatch> {
	const cells: Record<string, BulkPatch> = {};
	for (const edit of draft.edits) {
		for (const id of edit.targets) {
			cells[id] = { ...cells[id], [edit.field]: edit.value };
		}
	}
	return cells;
}

export function draftTablePatch(draft: BulkDraft): BulkPatch {
	return Object.fromEntries(
		draft.edits
			.filter((edit) => edit.global)
			.map((edit) => [edit.field, edit.value])
	);
}

export function stageBulkPatch(
	table: BlockTree,
	draft: BulkDraft,
	selection: BulkSelection,
	patch: BulkPatch
): BulkDraft {
	const selected = checkedSelection(table, selection);
	const selectedById = new Map(
		selected.map((p) => [p.cell.clientId, p.cell])
	);
	validatePatch(patch);
	let edits = [...draft.edits];
	for (const field of cellFields) {
		if (!owns(patch, field)) {
			continue;
		}
		const value = patch[field];
		const global =
			fieldPolicy(field).storage === 'inherited' &&
			selectsWholeTable(table, selection);
		let targets = cellsForField(selected, selection, field, table).map(
			(p) => p.cell.clientId
		);
		if (global) {
			const original = localFieldValue(table.attributes, field);
			const matches = original === value;
			const noOverrides = selected.every(
				(p) => localFieldValue(p.cell.attributes, field) === undefined
			);
			edits = edits.filter((edit) => edit.field !== field);
			if (
				matches &&
				noOverrides &&
				(fieldPolicy(field).normalization !== 'background' ||
					selected.every(
						(p) =>
							inheritedCellBackground(
								table.attributes,
								p.cell.attributes
							) === value
					))
			) {
				continue;
			}
		} else {
			const replaced = new Set(targets);
			edits = edits.flatMap((edit) => {
				if (edit.global || edit.field !== field) {
					return [edit];
				}
				const retained = edit.targets.filter((id) => !replaced.has(id));
				return retained.length ? [{ ...edit, targets: retained }] : [];
			});
			targets = targets.filter((id) => {
				if (
					edits.some(
						(edit) =>
							edit.field === field && edit.targets.includes(id)
					)
				) {
					return true;
				}
				const cell = selectedById.get(id)!;
				const original = localFieldValue(cell.attributes, field);
				return original !== value;
			});
		}
		if (targets.length) {
			edits.push({ field, value, targets, global });
		}
	}
	return { edits };
}

export function clearBulkFields(
	table: BlockTree,
	draft: BulkDraft,
	selection: BulkSelection,
	fields: BulkField[]
): BulkDraft {
	const selected = selectedCells(table, selection);
	const edits = draft.edits.flatMap((edit) => {
		if (!fields.includes(edit.field)) {
			return [edit];
		}
		const excluded = new Set(
			cellsForField(selected, selection, edit.field, table).map(
				(p) => p.cell.clientId
			)
		);
		const targets = edit.targets.filter((id) => !excluded.has(id));
		// Removing part of a whole-table edit makes it a cell-only operation.
		return targets.length
			? [
					{
						...edit,
						targets,
						global:
							edit.global &&
							targets.length === edit.targets.length,
					},
				]
			: [];
	});
	return { edits };
}

export function draftAffectedCells(
	table: BlockTree,
	draft: BulkDraft
): Placement[] {
	const ids = new Set(draft.edits.flatMap((edit) => edit.targets));
	return placements(table).filter((p) => ids.has(p.cell.clientId));
}
