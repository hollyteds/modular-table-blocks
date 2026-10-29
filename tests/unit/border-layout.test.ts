import { isBorderCollapse } from '../../src/styles/border-layout';
import { columnTemplate } from '../../src/styles/columns';
import { tokenStyle } from '../../src/styles/tokens';
import { lengthBounds } from '../../src/styles/controls';

test('only collapsed and separated layouts are accepted', () => {
	expect(isBorderCollapse('collapse')).toBe(true);
	expect(isBorderCollapse('separate')).toBe(true);
	for (const value of [
		undefined,
		null,
		0,
		[],
		'inherit',
		'separate;position:fixed',
	]) {
		expect(isBorderCollapse(value)).toBe(false);
	}
});

test('only explicit spacing values are emitted without mutating unrelated tokens', () => {
	const tokens = Object.freeze({
		borderSpacingHorizontal: '12px',
		borderSpacingVertical: '0.5em',
		borderWidth: '2px',
	});
	expect(tokenStyle(tokens)).toMatchObject({
		'--mtb-border-spacing-x': '12px',
		'--mtb-border-spacing-y': '0.5em',
		'--mtb-cell-border-t-width': '2px',
		'--mtb-cell-border-r-width': '2px',
		'--mtb-cell-border-b-width': '2px',
		'--mtb-cell-border-l-width': '2px',
	});
	expect(tokenStyle({})).toEqual({});
	for (const kind of [
		'borderSpacingHorizontal',
		'borderSpacingVertical',
	] as const) {
		expect(lengthBounds(kind, 'px')).toEqual({ min: 0, max: 200, step: 1 });
		expect(lengthBounds(kind, 'em')).toEqual({
			min: 0,
			max: 10,
			step: 0.05,
		});
	}
});

test('automatic and percentage columns reserve their share of internal gaps', () => {
	const columns = Object.freeze([
		Object.freeze({ width: '40%' }),
		Object.freeze({ width: '60%' }),
	]);
	const template = columnTemplate(columns);
	expect(template).toContain(
		'calc(40% - 0.4 * var(--mtb-editor-column-gap, 0px))'
	);
	expect(template).toContain(
		'calc(60% - 0.6 * var(--mtb-editor-column-gap, 0px))'
	);
	expect(columnTemplate([{}, {}, {}], 'auto')).toContain(
		'100% - 2 * var(--mtb-editor-column-gap, 0px)'
	);
	expect(columns[0].width).toBe('40%');
});
