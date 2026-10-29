import fixtures from '../fixtures/grid-validation.json';
import { buildGrid, validateGrid } from '../../src/grid/build-grid';

test.each(fixtures)('shared grid validation: $name', (fixture) => {
	const grid = buildGrid(
		fixture.cells.map((cell, index) => ({
			...cell,
			clientId: `cell-${index}`,
		})),
		fixture.rows,
		fixture.columns
	);
	expect(validateGrid(grid).length === 0).toBe(fixture.valid);
});
