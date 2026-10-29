import { TABLE_LIMITS } from '../grid/limits';

export const IMPORT_LIMITS = {
	rows: TABLE_LIMITS.rows,
	columns: TABLE_LIMITS.columns,
	input: 1000000,
	text: 200000,
};
export type ImportFormat = 'auto' | 'html' | 'csv' | 'tsv' | 'semicolon';
export interface ImportCell {
	row: number;
	column: number;
	rowSpan: number;
	colSpan: number;
	text: string;
	tag: 'th' | 'td';
}
export interface ImportData {
	rows: number;
	columns: number;
	headerRows: number;
	cells: ImportCell[];
	missing: number;
	format: Exclude<ImportFormat, 'auto'>;
}
export type ImportErrorCode =
	| 'empty'
	| 'limit'
	| 'quotes'
	| 'html'
	| 'html-merge'
	| 'merge'
	| 'grid'
	| 'anchor'
	| 'locked'
	| 'stale';
export class ImportError extends Error {
	constructor(
		public readonly code: ImportErrorCode,
		public readonly row?: number,
		public readonly column?: number
	) {
		super(code);
	}
}
export function checkInput(value: string): void {
	if (!value.length) {
		throw new ImportError('empty');
	}
	if (value.length > IMPORT_LIMITS.input) {
		throw new ImportError('limit');
	}
}
export function checkData(data: ImportData): ImportData {
	if (!data.rows || !data.columns || !data.cells.length) {
		throw new ImportError('empty');
	}
	if (
		data.rows > IMPORT_LIMITS.rows ||
		data.columns > IMPORT_LIMITS.columns ||
		data.cells.reduce((n, cell) => n + cell.text.length, 0) >
			IMPORT_LIMITS.text
	) {
		throw new ImportError('limit');
	}
	return data;
}
