import { parseHtml } from './parse-html';
import { parseText } from './parse-text';
import type { ImportFormat } from './types';

export function parseImport(
	text: string,
	html = '',
	format: ImportFormat = 'auto'
) {
	if (format === 'html' || (format === 'auto' && html)) {
		return parseHtml(html || text);
	}
	const delimiters = {
		auto: undefined,
		tsv: '\t',
		csv: ',',
		semicolon: ';',
	} as const;
	return parseText(text, delimiters[format]);
}
