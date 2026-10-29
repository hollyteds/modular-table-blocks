import { parseText } from '../../src/import/parse-text';
import { parseHtml } from '../../src/import/parse-html';
import { parseImport } from '../../src/import/parse';
import { planImport, richText } from '../../src/import/plan';
import { ImportError } from '../../src/import/types';
import { planOperation, structureErrors } from '../../src/grid/operations';
import type { BlockTree } from '../../src/grid/operations';

const fresh = (): BlockTree => ({
	clientId: 'table',
	name: 'modular-table-blocks/table',
	attributes: {},
	innerBlocks: [],
});
const options = {
	mode: 'overwrite' as const,
	row: 0,
	column: 0,
	firstRowHeader: false,
};
function table(rows = 3, columns = 3) {
	const result = planOperation(fresh(), {
		type: 'initialize',
		rows,
		columns,
	}).changes!;
	result.innerBlocks.forEach((cell, i) => {
		cell.clientId = `cell-${i}`;
		cell.innerBlocks[0].clientId = `text-${i}`;
		cell.innerBlocks[0].attributes.content = `original-${i}`;
	});
	return result;
}
function fails(fn: () => unknown, code: string) {
	expect(fn).toThrow(ImportError);
	try {
		fn();
	} catch (error) {
		expect((error as ImportError).code).toBe(code);
	}
}
const texts = (value: ReturnType<typeof parseText>) =>
	value.cells.map((cell) => cell.text);
test('CSV preserves quoted separators, newlines, quotes, spaces, zeroes and formulas as strings', () => {
	expect(
		texts(
			parseText(
				'001,"a,b","c""d",  padded  \r\n=SUM(A1),"line1\r\nline2",9999999999999999999,2026-01-02\r\n'
			)
		)
	).toEqual([
		'001',
		'a,b',
		'c"d',
		'  padded  ',
		'=SUM(A1)',
		'line1\nline2',
		'9999999999999999999',
		'2026-01-02',
	]);
});
test.each([
	['a\tb\nc\td', 'tsv'],
	['a;b\nc;d', 'semicolon'],
	['"a,b",c', 'csv'],
])('detects delimiters in %s', (text, format) =>
	expect(parseText(text).format).toBe(format)
);
test('manual delimiter overrides detection and BOM is ignored', () => {
	expect(texts(parseText('\uFEFFa,b;c', ';'))).toEqual(['a,b', 'c']);
});
test('missing fields differ from explicit blank fields', () => {
	const data = parseText('a,b,\nc\n,,\n');
	expect(data.rows).toBe(3);
	expect(data.columns).toBe(3);
	expect(data.missing).toBe(2);
	expect(data.cells).toHaveLength(7);
});
test.each([
	['a\n', 1],
	['a\n\n', 2],
	['\n', 1],
	['\n\n', 2],
	['""', 1],
])('does not invent a final row for %s', (text, rows) =>
	expect(parseText(text).rows).toBe(rows)
);
test.each(['"unfinished', '"closed"x'])('refuses invalid quotes %s', (text) =>
	fails(() => parseText(text), 'quotes')
);
test('limits refuse input instead of truncating', () => {
	fails(() => parseText('x'.repeat(1000001)), 'limit');
	fails(() => parseText('x'.repeat(200001)), 'limit');
	fails(() => parseText(Array(101).fill('x').join('\n')), 'limit');
	fails(() => parseText(Array(51).fill('x').join(',')), 'limit');
	fails(() => parseText(''), 'empty');
	fails(() => parseText('\uFEFF'), 'empty');
});
test('HTML extracts plain text, entities, TH and valid spans without resources or formats', () => {
	const data = parseHtml(
		'<table><thead><tr><th colspan="2">A &amp; B</th></tr></thead><tbody><tr><td rowspan="2"><b>bold</b><br>x<script>evil()</script><img src="https://invalid.test/"></td><td><p>one</p><p>two</p></td></tr><tr><td>z</td></tr></tbody></table>'
	);
	expect(data.headerRows).toBe(1);
	expect(data.rows).toBe(3);
	expect(data.columns).toBe(2);
	expect(data.missing).toBe(0);
	expect(data.cells.map((cell) => cell.text)).toEqual([
		'A & B',
		'bold\nx',
		'one\ntwo',
		'z',
	]);
	expect(data.cells[0].tag).toBe('th');
	expect(data.cells[1].rowSpan).toBe(2);
});
test('HTML plain text preserves whitespace and explicit line breaks', () =>
	expect(
		parseHtml('<table><tr><td>  a<br><br> b  </td></tr></table>').cells[0]
			.text
	).toBe('  a\n\n b  '));
test.each([
	'<p>not a table</p>',
	'<table><tr><td>x</td></tr></table><table></table>',
	'<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>',
])('refuses ambiguous HTML', (html) => fails(() => parseHtml(html), 'html'));
test.each([
	'<table><tr><td rowspan="0">x</td></tr></table>',
	'<table><tr><td rowspan="2">x</td></tr></table>',
	'<table><thead><tr><th rowspan="2">x</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>',
	'<table><tr><td>a</td><td rowspan="2">b</td></tr><tr><td colspan="2">c</td></tr></table>',
])('refuses invalid HTML merges', (html) =>
	fails(() => parseHtml(html), 'html-merge')
);

test('HTML footer follows the body even when its source markup appears first', () => {
	expect(
		parseHtml(
			'<table><tfoot><tr><td>footer</td></tr></tfoot><tbody><tr><td>body</td></tr></tbody></table>'
		).cells.map((cell) => cell.text)
	).toEqual(['body', 'footer']);
});

test('HTML accepts positive integer spans with leading zeroes and whitespace but refuses row-group crossings', () => {
	expect(
		parseHtml('<table><tr><td colspan=" 02 ">x</td></tr></table>').cells[0]
			.colSpan
	).toBe(2);
	fails(
		() =>
			parseHtml(
				'<table><tbody><tr><td rowspan="2">x</td></tr></tbody><tbody><tr><td>y</td></tr></tbody></table>'
			),
		'html-merge'
	);
});
test('clipboard HTML wins in automatic mode but manual text override remains available', () => {
	const html = '<table><tr><td>html</td></tr></table>';
	expect(parseImport('plain', html).cells[0].text).toBe('html');
	expect(parseImport('plain', html, 'tsv').cells[0].text).toBe('plain');
});
test('new imports do not copy table attrs, styles or ids; missing slots become empty cells', () => {
	const source = table();
	source.attributes.anchor = 'private';
	const plan = planImport(source, parseText('a,b\nc'), {
		...options,
		mode: 'new',
		firstRowHeader: true,
	});
	expect(plan.table.attributes).toEqual({
		rowCount: 2,
		columns: [{}, {}],
		headerRows: 1,
	});
	expect(plan.table.innerBlocks).toHaveLength(4);
	expect(plan.table.clientId).toBe('');
	expect(structureErrors(plan.table)).toEqual([]);
	expect(
		plan.table.innerBlocks.every(
			(cell) =>
				cell.innerBlocks.length === 1 &&
				cell.innerBlocks[0].name === 'modular-table-blocks/cell-text'
		)
	).toBe(true);
});
test('new HTML preserves header rows and span geometry', () => {
	const plan = planImport(
		fresh(),
		parseHtml(
			'<table><thead><tr><th colspan="2">H</th></tr></thead><tr><td>a</td><td>b</td></tr></table>'
		),
		{ ...options, mode: 'new' }
	);
	expect(plan.table.attributes.headerRows).toBe(1);
	expect(plan.table.innerBlocks).toHaveLength(3);
	expect(structureErrors(plan.table)).toEqual([]);
});
test('overwrite expands bottom/right, preserving attrs, source, IDs and untouched content', () => {
	const source = table();
	source.attributes.columns = [
		{ width: '20%' },
		{ width: '30%' },
		{ width: '50%' },
	];
	source.attributes.caption = 'Caption';
	source.innerBlocks[4].attributes.styleTokens = { cellBackground: 'red' };
	source.innerBlocks[4].attributes.tag = 'th';
	const before = JSON.stringify(source);
	const plan = planImport(source, parseText('a,b,c,d\ne,f,g,h\ni,j,k,l'), {
		...options,
		row: 1,
		column: 1,
	});
	expect(JSON.stringify(source)).toBe(before);
	expect(plan.addedRows).toBe(1);
	expect(plan.addedColumns).toBe(2);
	expect(plan.table.attributes.rowCount).toBe(4);
	expect(plan.table.attributes.columns).toEqual([
		{ width: '20%' },
		{ width: '30%' },
		{ width: '50%' },
		{},
		{},
	]);
	expect(plan.table.attributes.caption).toBe('Caption');
	expect(plan.table.innerBlocks[0]).toBe(source.innerBlocks[0]);
	const target = plan.table.innerBlocks.find(
		(cell) => cell.clientId === 'cell-4'
	)!;
	expect(target.attributes).toEqual(source.innerBlocks[4].attributes);
	expect(target.innerBlocks[0].attributes.content).toBe('a');
	expect(plan.overwriteCount).toBe(4);
	expect(structureErrors(plan.table)).toEqual([]);
});
test('smaller imports keep remaining cells and explicit blank clears while missing preserves', () => {
	const source = table(2, 2);
	const next = planImport(source, parseText('x,\ny'), options).table;
	expect(
		next.innerBlocks.map((cell) => cell.innerBlocks[0].attributes.content)
	).toEqual(['x', '', 'y', 'original-3']);
	expect(next.innerBlocks[3]).toBe(source.innerBlocks[3]);
});
test('import escapes literal markup, preserves linebreaks, never executes formula strings', () =>
	expect(richText('<img onerror="evil()">&\n=1+1')).toBe(
		'&lt;img onerror=&quot;evil()&quot;&gt;&amp;<br>=1+1'
	));
test('scalar overwrites a merged cell but multiple values require exact matching geometry', () => {
	const merged = planOperation(table(), {
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 1,
		right: 1,
	}).changes!;
	expect(
		planImport(merged, parseText('one'), options).table.innerBlocks[0]
			.attributes.rowSpan
	).toBe(2);
	fails(() => planImport(merged, parseText('a,b\nc,d'), options), 'merge');
	const data = parseHtml(
		'<table><tr><td rowspan="2" colspan="2">one</td></tr><tr></tr></table>'
	);
	expect(structureErrors(planImport(merged, data, options).table)).toEqual(
		[]
	);
	fails(() => planImport(table(), data, options), 'merge');
});
test('partial merged intersection refuses at the conflicting cell; new merged additions refuse', () => {
	const merged = planOperation(table(), {
		type: 'mergeCells',
		top: 0,
		left: 0,
		bottom: 1,
		right: 1,
	}).changes!;
	fails(
		() =>
			planImport(merged, parseText('x'), {
				...options,
				row: 0,
				column: 1,
			}),
		'anchor'
	);
	fails(
		() =>
			planImport(
				table(1, 1),
				parseHtml('<table><tr><td colspan="2">x</td></tr></table>'),
				{ ...options, row: 0, column: 0 }
			),
		'merge'
	);
});
test('targets and descendants with locks refuse, while unrelated locked cells survive', () => {
	const source = table();
	source.innerBlocks[8].attributes.lock = { remove: true };
	expect(
		planImport(source, parseText('x'), options).table.innerBlocks[8]
	).toBe(source.innerBlocks[8]);
	fails(
		() =>
			planImport(source, parseText('x'), {
				...options,
				row: 2,
				column: 2,
			}),
		'locked'
	);
	source.innerBlocks[0].innerBlocks[0].attributes.lock = { move: true };
	fails(() => planImport(source, parseText('x'), options), 'locked');
});

test('missing CSV fields do not silently permit a rectangle crossing an unmatched merged cell', () => {
	const source = planOperation(table(), {
		type: 'mergeCells',
		top: 1,
		left: 1,
		bottom: 1,
		right: 2,
	}).changes!;
	fails(() => planImport(source, parseText('a,b,c\nd'), options), 'merge');
});
test('out of bounds, stale coordinate and invalid existing grid refuse atomically', () => {
	fails(
		() =>
			planImport(table(), parseText('x\ny'), {
				...options,
				row: 2,
				column: 3,
			}),
		'anchor'
	);
	const source = planImport(
		fresh(),
		parseText(Array(100).fill('x').join('\n')),
		{ ...options, mode: 'new' }
	).table;
	fails(
		() => planImport(source, parseText('x\ny'), { ...options, row: 99 }),
		'limit'
	);
	const broken = table();
	broken.innerBlocks.pop();
	fails(() => planImport(broken, parseText('x'), options), 'grid');
});
test('maximum logical grid can be generated without mutating source', () => {
	const data = parseText(
		Array(100).fill(Array(50).fill('x').join(',')).join('\n')
	);
	const plan = planImport(fresh(), data, { ...options, mode: 'new' });
	expect(plan.table.innerBlocks).toHaveLength(5000);
	expect(structureErrors(plan.table)).toEqual([]);
});

test('invalid target cell markup must be recovered before replacing its contents', () => {
	const source = table();
	source.innerBlocks[0].isValid = false;
	const before = JSON.stringify(source);
	fails(() => planImport(source, parseText('x'), options), 'grid');
	expect(JSON.stringify(source)).toBe(before);
});
