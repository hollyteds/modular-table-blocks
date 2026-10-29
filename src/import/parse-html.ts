import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { checkInput, checkData, IMPORT_LIMITS, ImportError } from './types';
import type { ImportCell, ImportData } from './types';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const children = (node: Node): Node[] =>
	'childNodes' in node ? node.childNodes : [];
const tag = (node?: Node): string =>
	node && 'tagName' in node ? node.tagName : '';
const ignored = new Set([
	'script',
	'style',
	'template',
	'iframe',
	'object',
	'noscript',
]);
const blocks = new Set([
	'p',
	'div',
	'li',
	'ul',
	'ol',
	'section',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
]);

function textContent(root: Node): string {
	let text = '';
	const stack: { node: Node; end?: boolean }[] = children(root)
		.map((node) => ({ node }))
		.reverse();
	while (stack.length) {
		const { node, end } = stack.pop()!;
		const name = tag(node);
		if (ignored.has(name)) {
			continue;
		}
		if (end) {
			if (text && !text.endsWith('\n')) {
				text += '\n';
			}
			continue;
		}
		if (node.nodeName === '#text') {
			text += (node as DefaultTreeAdapterMap['textNode']).value;
		} else if (name === 'br') {
			text += '\n';
		} else {
			if (blocks.has(name)) {
				if (text && !text.endsWith('\n')) {
					text += '\n';
				}
				stack.push({ node, end: true });
			}
			for (let i = children(node).length - 1; i >= 0; i--) {
				stack.push({ node: children(node)[i] });
			}
		}
	}
	// Remove only the separator introduced by a final block element, not user whitespace.
	if (
		blocks.has(tag(children(root)[children(root).length - 1])) &&
		text.endsWith('\n')
	) {
		text = text.slice(0, -1);
	}
	return text.replace(/\r\n?/g, '\n');
}

export function plainCellText(value: string): string {
	return textContent(parseFragment(value, { scriptingEnabled: false }));
}

export function parseHtml(value: string): ImportData {
	checkInput(value);
	const root = parseFragment(value, { scriptingEnabled: false });
	const stack: Node[] = [...root.childNodes];
	const tables: Element[] = [];
	while (stack.length) {
		const node = stack.pop()!;
		if (ignored.has(tag(node))) {
			continue;
		}
		if (tag(node) === 'table') {
			tables.push(node as Element);
		}
		for (const child of children(node)) {
			stack.push(child);
		}
	}
	if (tables.length !== 1) {
		throw new ImportError('html');
	}
	const table = tables[0];
	const rows: { node: Node; header: boolean; section: Node }[] = [];
	const addRow = (node: Node, section: Node, header: boolean) => {
		if (rows.length >= IMPORT_LIMITS.rows) {
			throw new ImportError('limit');
		}
		rows.push({ node, section, header });
	};
	const heads = children(table).filter((node) => tag(node) === 'thead');
	const bodies = children(table).filter(
		(node) => !['thead', 'tfoot'].includes(tag(node))
	);
	const feet = children(table).filter((node) => tag(node) === 'tfoot');
	for (const section of [...heads, ...bodies, ...feet]) {
		if (tag(section) === 'tr') {
			addRow(section, table, false);
		} else if (['thead', 'tbody', 'tfoot'].includes(tag(section))) {
			for (const node of children(section)) {
				if (tag(node) === 'tr') {
					addRow(node, section, tag(section) === 'thead');
				}
			}
		}
	}
	const headerRows = rows.filter((row) => row.header).length;
	const occupied = Array.from(
		{ length: rows.length },
		() => new Set<number>()
	);
	const cells: ImportCell[] = [];
	let columns = 0;
	rows.forEach(({ node, section }, row) => {
		let column = 0;
		for (const child of children(node).filter((n) =>
			['td', 'th'].includes(tag(n))
		)) {
			while (occupied[row].has(column)) {
				column++;
			}
			const span = (attr: string) => {
				const raw = (child as Element).attrs.find(
					(a) => a.name === attr
				)?.value;
				if (raw === undefined) {
					return 1;
				}
				if (
					!/^\d+$/.test(raw.trim()) ||
					!Number.isSafeInteger(Number(raw)) ||
					Number(raw) < 1
				) {
					throw new ImportError('html-merge', row, column);
				}
				return Number(raw);
			};
			const rowSpan = span('rowspan');
			const colSpan = span('colspan');
			if (column + colSpan > IMPORT_LIMITS.columns) {
				throw new ImportError('limit');
			}
			if (
				row + rowSpan > rows.length ||
				rows[row + rowSpan - 1]?.section !== section ||
				(row < headerRows && row + rowSpan > headerRows)
			) {
				throw new ImportError('html-merge', row, column);
			}
			for (let r = row; r < row + rowSpan; r++) {
				for (let c = column; c < column + colSpan; c++) {
					if (occupied[r].has(c)) {
						throw new ImportError('html-merge', row, column);
					}
					occupied[r].add(c);
				}
			}
			cells.push({
				row,
				column,
				rowSpan,
				colSpan,
				text: textContent(child),
				tag: tag(child) as 'th' | 'td',
			});
			column += colSpan;
			columns = Math.max(columns, column);
		}
	});
	return checkData({
		rows: rows.length,
		columns,
		headerRows,
		cells,
		format: 'html',
		missing:
			rows.length * columns -
			occupied.reduce((sum, row) => sum + row.size, 0),
	});
}
