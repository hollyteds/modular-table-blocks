import {
	alignmentPatch,
	matrixAlignment,
	matrixPosition,
	normalizeMatrixAlignment,
} from '../../src/styles/alignment';
import { editorStyle } from '../../src/styles/native';

test('all nine matrix positions round-trip through the persisted vertical and horizontal fields', () => {
	for (let index = 0; index < 9; index++) {
		const value = matrixPosition(index)!;
		const patch = alignmentPatch(value);
		expect(matrixAlignment(patch.verticalAlign, patch.textAlign)).toBe(
			value
		);
		expect(normalizeMatrixAlignment(value)).toBe(value);
	}
	expect(normalizeMatrixAlignment('center')).toBe('center center');
	expect(alignmentPatch(undefined)).toEqual({
		verticalAlign: undefined,
		textAlign: undefined,
	});
});

test('inherited or mixed axes remain unselected and malformed positions are rejected', () => {
	for (const [vertical, horizontal] of [
		[undefined, 'left'],
		['top', undefined],
		['center', 'left'],
		['top', 'justify'],
	]) {
		expect(matrixAlignment(vertical, horizontal)).toBeUndefined();
	}
	for (const value of [
		null,
		'',
		'middle left',
		'top left extra',
		'top center;position:fixed',
		'left top',
	]) {
		expect(normalizeMatrixAlignment(value)).toBeUndefined();
	}
	for (const index of [-1, 9, 1.5, NaN]) {
		expect(matrixPosition(index)).toBeUndefined();
	}
	expect(
		editorStyle({ style: { typography: { textAlign: 'right' } } }).textAlign
	).toBe('right');
});
