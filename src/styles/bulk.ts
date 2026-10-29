// Public bulk-edit API. Domain modules do not import this facade.
export type {
	BulkSelection,
	BulkField,
	BulkPatch,
	BulkEdit,
	BulkDraft,
} from '../bulk/types';
export {
	boxKinds,
	boxFields,
	cellFields,
	owns,
	fieldValue,
	commonValue,
	boxPatch,
	resolvedFieldValue,
} from '../bulk/fields';
export {
	toggleBulkAll,
	selectBulkAxis,
	structureSignature,
	selectedCells,
	crossesSelection,
	selectionSides,
	cellsForField,
	selectsWholeTable,
} from '../bulk/selection';
export { commonBorderStyleDefaults, commonTokens } from '../bulk/values';
export {
	emptyBulkDraft,
	draftCellPatches,
	draftTablePatch,
	stageBulkPatch,
	clearBulkFields,
	draftAffectedCells,
} from '../bulk/draft';
export {
	projectBulkDraft,
	projectBulkPlan,
	planBulkDraft,
	planBulkUpdate,
} from '../bulk/plan';
