import type { Side, SideKind } from '../styles/sides';
import type { TypographyField } from '../styles/typography';

export type BulkSelection = {
	mode: 'all' | 'rows' | 'columns';
	indices: number[];
	all: boolean;
};

export type BulkField =
	| 'tag'
	| 'verticalAlign'
	| 'textAlign'
	| 'cellBackgroundColor'
	| TypographyField
	| `${SideKind}.${Side}`;
// An absent key is unchanged; an own key with undefined explicitly restores inheritance.
export type BulkPatch = Partial<Record<BulkField, string | undefined>>;

export type BulkEdit = {
	field: BulkField;
	value: string | undefined;
	targets: string[];
	global: boolean;
};
export type BulkDraft = {
	edits: BulkEdit[];
};

export type BulkUpdates = Record<string, Record<string, unknown>>;
