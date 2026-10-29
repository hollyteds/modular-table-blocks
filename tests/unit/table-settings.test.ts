import {
	resetTableSection,
	tableSectionHasValue,
} from '../../src/table-settings';
import type { TableSettingsAttributes } from '../../src/table-settings';

function fixture(): TableSettingsAttributes {
	const attributes: TableSettingsAttributes = {
		columns: [
			{ width: '25%', label: 'A' },
			{ width: '75%', label: 'B' },
			{},
		],
		columnWidthMode: 'auto',
		borderCollapse: 'separate',
		caption: '<strong>Caption</strong>',
		captionEnabled: true,
		captionSide: 'bottom',
		captionAlign: 'right',
		styleTokens: {
			tableWidth: '80%',
			borderSpacingHorizontal: '0px',
			borderSpacingVertical: '0.5em',
			borderWidth: '2px',
			cellBackgroundColor: '#abcdef',
		},
	};
	attributes.columns.forEach(Object.freeze);
	Object.freeze(attributes.columns);
	Object.freeze(attributes.styleTokens);
	return Object.freeze(attributes);
}

test('column reset clears retained widths and mode while preserving column metadata and other sections', () => {
	const source = fixture();
	const patch = resetTableSection(source, 'columns');
	expect(patch).toEqual({
		columnWidthMode: undefined,
		columns: [{ label: 'A' }, { label: 'B' }, {}],
	});
	expect(patch.columns?.[2]).toBe(source.columns[2]);
	expect(source.columns[0]).toEqual({ width: '25%', label: 'A' });
	expect({ ...source, ...patch }).toMatchObject({
		caption: source.caption,
		borderCollapse: 'separate',
		styleTokens: source.styleTokens,
	});
	expect(tableSectionHasValue({ ...source, ...patch }, 'columns')).toBe(
		false
	);
});

test('spacing reset removes both axes including zero and preserves border cell and table styles', () => {
	const source = fixture();
	const patch = resetTableSection(source, 'spacing');
	expect(patch).toEqual({
		borderCollapse: undefined,
		styleTokens: {
			tableWidth: '80%',
			borderWidth: '2px',
			cellBackgroundColor: '#abcdef',
		},
	});
	expect(source.styleTokens?.borderSpacingHorizontal).toBe('0px');
	expect({ ...source, ...patch }).toMatchObject({
		columns: source.columns,
		caption: source.caption,
		captionSide: 'bottom',
	});
	expect(tableSectionHasValue({ ...source, ...patch }, 'spacing')).toBe(
		false
	);
});

test('table width reset leaves spacing and every other token intact', () => {
	const source = fixture();
	const patch = resetTableSection(source, 'width');
	expect(patch).toEqual({
		styleTokens: {
			borderSpacingHorizontal: '0px',
			borderSpacingVertical: '0.5em',
			borderWidth: '2px',
			cellBackgroundColor: '#abcdef',
		},
	});
	expect(source.styleTokens?.tableWidth).toBe('80%');
	expect(tableSectionHasValue({ ...source, ...patch }, 'width')).toBe(false);
	expect(
		resetTableSection(
			{ caption: '', columns: [{}], styleTokens: { tableWidth: '80%' } },
			'width'
		)
	).toEqual({ styleTokens: undefined });
});

test('caption reset hides preserved rich text and resets placement and alignment only', () => {
	const source = fixture();
	const patch = resetTableSection(source, 'caption');
	expect(patch).toEqual({
		captionEnabled: false,
		captionSide: undefined,
		captionAlign: undefined,
	});
	const result = { ...source, ...patch };
	expect(result.caption).toBe('<strong>Caption</strong>');
	expect(result.styleTokens).toBe(source.styleTokens);
	expect(result.columns).toBe(source.columns);
	expect(tableSectionHasValue(result, 'caption')).toBe(false);
});

test('unset sections are not resettable and explicit zero spacing remains resettable', () => {
	const source: TableSettingsAttributes = { caption: '', columns: [{}] };
	for (const section of ['columns', 'spacing', 'width', 'caption'] as const) {
		expect(tableSectionHasValue(source, section)).toBe(false);
	}
	expect(
		tableSectionHasValue(
			{ ...source, styleTokens: { borderSpacingVertical: '0' } },
			'spacing'
		)
	).toBe(true);
	expect(
		tableSectionHasValue(
			{ ...source, caption: 'Automatic caption' },
			'caption'
		)
	).toBe(true);
	expect(resetTableSection(source, 'spacing')).toEqual({
		borderCollapse: undefined,
		styleTokens: undefined,
	});
});
