import fixtures from '../fixtures/cell-semantics.json';
import { cellSemantics, effectiveCellTag } from '../../src/grid/cell-type';

test.each(fixtures)(
	'cell type and parent management: table=$table, cell=$cell',
	(fixture) => {
		const before = JSON.stringify(fixture);
		expect(cellSemantics(fixture.table, fixture.cell)).toEqual({
			tag: fixture.tag,
			isManagedHeader: fixture.managed,
		});
		expect(effectiveCellTag(fixture.table, fixture.cell)).toBe(fixture.tag);
		expect(JSON.stringify(fixture)).toBe(before);
	}
);
