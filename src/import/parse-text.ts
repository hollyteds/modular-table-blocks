import { checkData, checkInput, ImportError, IMPORT_LIMITS } from './types';
import type { ImportData } from './types';

/**
 * Quoted fields are parsed before delimiters or record separators are considered.
 * @param value
 * @param delimiter
 */
function records(value: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let closed = false;
	let ended = false;
	const push = () => {
		row.push(field);
		if (row.length > IMPORT_LIMITS.columns) {
			throw new ImportError('limit');
		}
		field = '';
		closed = false;
	};
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		ended = false;
		if (quoted) {
			if (ch === '"') {
				if (value[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
					closed = true;
				}
			} else if (ch === '\r') {
				field += '\n';
				if (value[i + 1] === '\n') {
					i++;
				}
			} else {
				field += ch;
			}
		} else if (ch === delimiter) {
			push();
		} else if (ch === '\n' || ch === '\r') {
			push();
			rows.push(row);
			row = [];
			ended = true;
			if (rows.length > IMPORT_LIMITS.rows) {
				throw new ImportError('limit');
			}
			if (ch === '\r' && value[i + 1] === '\n') {
				i++;
			}
		} else if (ch === '"' && field === '' && !closed) {
			quoted = true;
		} else {
			if (closed) {
				throw new ImportError('quotes');
			}
			field += ch;
		}
	}
	if (quoted) {
		throw new ImportError('quotes');
	}
	if (!ended) {
		push();
		rows.push(row);
	}
	return rows;
}

export function parseText(
	value: string,
	delimiter?: ',' | '\t' | ';'
): ImportData {
	checkInput(value);
	const input = value.replace(/^\uFEFF/, '');
	if (!input.length) {
		throw new ImportError('empty');
	}
	let actual = delimiter;
	if (!actual) {
		// Count only separators outside quoted fields. Prefer tabs for spreadsheet text.
		const counts = { '\t': 0, ',': 0, ';': 0 };
		let quoted = false;
		for (let i = 0; i < input.length; i++) {
			if (input[i] === '"') {
				if (quoted && input[i + 1] === '"') {
					i++;
				} else {
					quoted = !quoted;
				}
			} else if (!quoted && input[i] in counts) {
				counts[input[i] as keyof typeof counts]++;
			}
		}
		actual = counts[';'] > counts[','] ? ';' : ',';
		if (counts['\t']) {
			actual = '\t';
		}
	}
	const rows = records(input, actual);
	const columns = Math.max(...rows.map((row) => row.length));
	return checkData({
		rows: rows.length,
		columns,
		headerRows: 0,
		format: ({ '\t': 'tsv', ';': 'semicolon', ',': 'csv' } as const)[
			actual
		],
		missing: rows.reduce((sum, row) => sum + columns - row.length, 0),
		cells: rows.flatMap((row, r) =>
			row.map((text, c) => ({
				row: r,
				column: c,
				rowSpan: 1,
				colSpan: 1,
				tag: 'td' as const,
				text,
			}))
		),
	});
}
