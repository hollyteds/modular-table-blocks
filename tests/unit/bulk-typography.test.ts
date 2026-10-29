import { planOperation } from '../../src/grid/operations';
import {
	emptyBulkDraft,
	stageBulkPatch,
	projectBulkDraft,
	planBulkDraft,
	structureSignature,
	fieldValue,
	resolvedFieldValue,
} from '../../src/styles/bulk';
import type { BulkPatch, BulkSelection } from '../../src/styles/bulk';
import { typographyFields } from '../../src/styles/typography';
import {
	previewStyle,
	rebasePreviewEnvironment,
} from '../../src/styles/bulk-preview';

const all: BulkSelection = { mode: 'all', all: true, indices: [] };
const row: BulkSelection = { mode: 'rows', all: false, indices: [0] };
function table() {
	const result = planOperation(
		{
			clientId: 'table',
			name: 'modular-table-blocks/table',
			attributes: {},
			innerBlocks: [],
		},
		{ type: 'initialize', rows: 2, columns: 2 }
	).changes!;
	result.innerBlocks.forEach((cell, index) => {
		cell.clientId = `cell-${index}`;
	});
	return result;
}
const sample: BulkPatch = {
	textColor: 'var(--wp--preset--color--contrast)',
	fontFamily: 'var(--wp--preset--font-family--mono)',
	fontSize: 'var(--wp--preset--font-size--large)',
	lineHeight: '1.8',
	fontWeight: '600',
	fontStyle: 'italic',
	letterSpacing: '0.2em',
	textDecoration: 'underline',
	textTransform: 'uppercase',
	writingMode: 'vertical-rl',
};

test.each<BulkPatch>([
	{ fontSize: '1px' },
	{ fontSize: '240px' },
	{ fontSize: '5vw' },
	{ fontSize: '10vh' },
	{ lineHeight: '0' },
	{ lineHeight: '8' },
])(
	'native sizing accepts standard values beyond the old token slider bounds %j',
	(patch) => {
		const source = table();
		expect(() =>
			stageBulkPatch(source, emptyBulkDraft(), all, patch)
		).not.toThrow();
	}
);

test('native bulk typography preserves presets, unrelated attributes and immutable source across scopes and normalization', () => {
	const source = table();
	source.attributes.columns = [
		{ label: 'A', width: '40%' },
		{ label: 'B', width: '60%' },
	];
	source.innerBlocks.forEach((cell) => {
		cell.attributes.style = {
			color: { background: '#abc' },
			typography: { textAlign: 'right' },
		};
	});
	const before = JSON.stringify(source);
	const draft = stageBulkPatch(source, emptyBulkDraft(), row, sample);
	const updates = planBulkDraft(source, structureSignature(source), draft);
	const projected = projectBulkDraft(source, draft);
	for (const cell of projected.innerBlocks) {
		for (const field of typographyFields) {
			expect(fieldValue(cell.attributes, field)).toBe(
				cell.attributes.row === 0 ? sample[field] : undefined
			);
		}
	}
	for (const cell of source.innerBlocks.filter(
		(item) => item.attributes.row === 0
	)) {
		expect(updates[cell.clientId]).toMatchObject({
			fontFamily: 'mono',
			fontSize: 'large',
			textColor: 'contrast',
			style: {
				color: { background: '#abc' },
				typography: { textAlign: 'right', lineHeight: '1.8' },
			},
		});
	}
	const uniform = stageBulkPatch(
		source,
		draft,
		{ ...row, indices: [1] },
		sample
	);
	const normalized = planBulkDraft(
		source,
		structureSignature(source),
		uniform
	);
	const attrs = { ...source.attributes, ...normalized.table };
	for (const field of typographyFields) {
		expect(fieldValue(attrs, field)).toBe(sample[field]);
		for (const cell of source.innerBlocks) {
			expect(
				fieldValue(
					{ ...cell.attributes, ...normalized[cell.clientId] },
					field
				)
			).toBeUndefined();
		}
	}
	expect(normalized.table).not.toHaveProperty('columns');
	expect(JSON.stringify(source)).toBe(before);
});

test('resetting native fields clears only selected overrides and removes captured obsolete preview properties', () => {
	const source = table();
	source.attributes.style = {
		typography: { fontFamily: 'serif', letterSpacing: '1px' },
		color: { text: '#123456' },
	};
	source.innerBlocks[0].attributes = {
		...source.innerBlocks[0].attributes,
		fontFamily: 'mono',
		textColor: 'contrast',
		style: {
			typography: { letterSpacing: '2px' },
			color: { background: '#abcdef' },
		},
	};
	const patch = Object.fromEntries(
		typographyFields.map((field) => [field, undefined])
	);
	const updates = planBulkDraft(
		source,
		structureSignature(source),
		stageBulkPatch(source, emptyBulkDraft(), row, patch)
	);
	const attrs = {
		...source.innerBlocks[0].attributes,
		...updates[source.innerBlocks[0].clientId],
	};
	expect(resolvedFieldValue(source, attrs, 'fontFamily')).toBe('serif');
	expect(resolvedFieldValue(source, attrs, 'textColor')).toBe('#123456');
	expect(attrs.style).toMatchObject({ color: { background: '#abcdef' } });
	const rebased = rebasePreviewEnvironment(
		{
			table: {
				fontFamily: 'monospace',
				color: 'red',
				letterSpacing: '2px',
			},
			blocks: {
				cell: {
					fontStyle: 'italic',
					fontWeight: '700',
					writingMode: 'vertical-rl',
				},
			},
			fontSizes: {},
		},
		patch
	);
	expect(rebased.table).toEqual({});
	expect(rebased.blocks.cell).toEqual({});
	expect(
		previewStyle({
			style: {
				typography: {
					fontWeight: '600',
					fontStyle: 'italic',
					letterSpacing: '1px',
				},
				color: { text: '#123456' },
			},
		})
	).toMatchObject({
		fontWeight: '600',
		fontStyle: 'italic',
		letterSpacing: '1px',
		color: '#123456',
	});
});

test.each([
	{ fontFamily: 'url(evil)' },
	{ fontFamily: 'serif; color:red' },
	{ fontWeight: '1001' },
	{ fontWeight: 'NaN' },
	{ fontStyle: 'inherit;position:fixed' },
	{ letterSpacing: 'calc(1px;)' },
	{ textDecoration: 'blink' },
	{ textTransform: 'invalid' },
	{ writingMode: 'sideways-lr' },
	{ textColor: 'url(evil)' },
	{ columnWidth: '40%' },
])('rejects unsafe or removed bulk typography input %j', (patch) => {
	const source = table();
	expect(() =>
		stageBulkPatch(source, emptyBulkDraft(), all, patch as BulkPatch)
	).toThrow();
});
