import { columnTemplate, columnWidthMode } from '../../src/styles/columns';
import { planOperation } from '../../src/grid/operations';
import {
	emptyBulkDraft,
	projectBulkDraft,
	stageBulkPatch,
} from '../../src/styles/bulk';

test('new tables default to equal widths without filling every column with a width', () => {
	for (const columns of [undefined, [], [{}, {}, {}], [[], []]]) {
		expect(columnWidthMode({ columns })).toBe('equal');
	}
	expect(columnTemplate([{}, {}, {}])).toBe(
		'repeat(3, minmax(var(--mtb-editor-column-min-width, 0px), 1fr))'
	);
});

test.each(['equal', 'auto', 'custom'] as const)(
	'explicit %s mode takes precedence without mutating saved widths',
	(mode) => {
		const columns = Object.freeze([
			Object.freeze({ width: '20%' }),
			Object.freeze({ width: '300px' }),
		]);
		expect(columnWidthMode({ columns, columnWidthMode: mode })).toBe(mode);
		const template = columnTemplate(columns, mode);
		if (mode === 'custom') {
			expect(template).toContain('20%');
			expect(template).toContain('300px');
		} else {
			expect(template).not.toContain('20%');
			expect(template).not.toContain('300px');
			expect(template).toContain(mode === 'equal' ? '1fr' : 'auto');
		}
		expect(columns).toEqual([{ width: '20%' }, { width: '300px' }]);
	}
);

test('previously specified columns remain custom and invalid widths do not become layout instructions', () => {
	expect(columnWidthMode({ columns: [{}, { width: '40%' }] })).toBe('custom');
	expect(
		columnWidthMode({
			columns: [{ width: '12px;position:fixed' }],
			columnWidthMode: 'bad',
		})
	).toBe('equal');
	expect(
		columnTemplate([{ width: '12px;position:fixed' }], 'custom')
	).not.toContain('position');
	expect(columnTemplate(null)).toContain('repeat(3,');
	expect(columnTemplate(Array.from({ length: 51 }, () => ({})))).toContain(
		'repeat(3,'
	);
});

test.each(['equal', 'auto'] as const)(
	'bulk cell edits preserve inactive stored widths in %s mode',
	(mode) => {
		const table = planOperation(
			{
				clientId: 'table',
				name: 'modular-table-blocks/table',
				attributes: {},
				innerBlocks: [],
			},
			{ type: 'initialize', rows: 1, columns: 2 }
		).changes!;
		table.attributes.columnWidthMode = mode;
		table.attributes.columns = [{ width: '35%' }, {}];
		const draft = stageBulkPatch(
			table,
			emptyBulkDraft(),
			{ mode: 'columns', all: false, indices: [0] },
			{ fontSize: '20px' }
		);
		expect(projectBulkDraft(table, draft).attributes).toMatchObject({
			columnWidthMode: mode,
			columns: [{ width: '35%' }, {}],
		});
		expect(table.attributes.columnWidthMode).toBe(mode);
	}
);
