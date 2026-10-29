import { bulkFailure } from '../../bulk/errors';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { useRegistry, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import type { BlockTree } from '../../grid/operations';
import { structureErrors } from '../../grid/operations';
import {
	boxPatch,
	commonTokens,
	commonBorderStyleDefaults,
	commonValue,
	crossesSelection,
	cellsForField,
	resolvedFieldValue,
	fieldValue,
	selectsWholeTable,
	draftCellPatches,
	owns,
	planBulkDraft,
	stageBulkPatch,
	clearBulkFields,
	draftAffectedCells,
	emptyBulkDraft,
	projectBulkDraft,
	projectBulkPlan,
	selectedCells,
	structureSignature,
} from '../../styles/bulk';
import type { BulkField, BulkPatch, BulkSelection } from '../../styles/bulk';
import type { StyleTokens } from '../../styles/tokens';
import { updateBulkAttributes } from '../style-compat';

export type BulkEditorOptions = {
	source: BlockTree;
	onApplied: (table: BlockTree, edited: BulkPatch) => void;
};

export function useBulkCellEditor({ source, onApplied }: BulkEditorOptions) {
	const registry = useRegistry();
	const latest = useSelect(
		(select) => select(blockEditorStore).getBlock(source.clientId),
		[source.clientId]
	);
	const [selection, setSelection] = useState<BulkSelection>({
		mode: 'all',
		indices: [],
		all: false,
	});
	const [draft, setDraft] = useState(emptyBulkDraft);
	const [error, setError] = useState<ReturnType<typeof bulkFailure> | null>(
		null
	);
	const [applied, setApplied] = useState(false);
	const projected = useMemo(
		() => projectBulkDraft(source, draft),
		[source, draft]
	);
	const pendingCells = draftCellPatches(draft);
	const read = (attributes: BlockTree['attributes'], field: BulkField) =>
		resolvedFieldValue(projected, attributes, field);
	const cells = selectedCells(projected, selection);
	const targets = (field: BulkField) =>
		cellsForField(cells, selection, field, projected);
	const typeCells = targets('tag');
	const typeValue = commonValue(
		(typeCells.length ? typeCells : cells).map((p) =>
			read(p.cell.attributes, 'tag')
		)
	);
	const areaCells = targets('cellBackgroundColor');
	const crossing = cells.some((p) => crossesSelection(p, selection));
	const tokens = commonTokens(cells, {}, selection, projected);
	const borderDefaults = commonBorderStyleDefaults(
		projected,
		cells,
		selection
	);
	const affected = draftAffectedCells(source, draft);
	const pending = (field: BulkField) =>
		targets(field).some((p) =>
			owns(pendingCells[p.cell.clientId] ?? {}, field)
		);
	const stale =
		!latest ||
		structureSignature(latest) !== structureSignature(source) ||
		structureErrors(latest).length > 0;
	const changeSelection = (next: BulkSelection) => {
		setSelection(next);
		setError(null);
	};
	const alignmentRead = (
		attributes: BlockTree['attributes'],
		field: BulkField
	) =>
		field === 'textAlign' && !selectsWholeTable(projected, selection)
			? fieldValue(attributes, field)
			: read(attributes, field);
	const update = (next: BulkPatch) => {
		try {
			setDraft(stageBulkPatch(source, draft, selection, next));
			setError(null);
			setApplied(false);
		} catch (cause) {
			setError(bulkFailure(cause));
		}
	};
	const boxChange = (apply: () => StyleTokens, keys: BulkField[]) => {
		try {
			update(boxPatch(tokens, apply(), keys));
		} catch (cause) {
			setError(bulkFailure(cause));
		}
	};
	const apply = () => {
		try {
			const current = registry
				.select(blockEditorStore)
				.getBlock(source.clientId);
			if (!current) {
				return;
			}
			const updates = planBulkDraft(
				current,
				structureSignature(source),
				draft
			);
			updateBulkAttributes(registry, updates);
			onApplied(
				projectBulkPlan(current, updates),
				Object.fromEntries(
					draft.edits.map((edit) => [edit.field, undefined])
				)
			);
			setDraft(emptyBulkDraft());
			setError(null);
			setApplied(true);
		} catch (cause) {
			setError(bulkFailure(cause));
		}
	};

	const leaveUnchanged = (keys: BulkField[]) =>
		setDraft((previous) =>
			clearBulkFields(source, previous, selection, keys)
		);
	return {
		source,
		selection,
		draft,
		error,
		applied,
		projected,
		cells,
		typeCells,
		typeValue,
		areaCells,
		crossing,
		tokens,
		borderDefaults,
		affected,
		pending,
		stale,
		changeSelection,
		alignmentRead,
		read,
		targets,
		update,
		boxChange,
		apply,
		leaveUnchanged,
	};
}
export type BulkCellEditor = ReturnType<typeof useBulkCellEditor>;
