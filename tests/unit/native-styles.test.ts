import {
	applyBorderValue,
	applyPaddingValue,
	borderControlValue,
	borderStyleDefaults,
	paddingControlValue,
	resetBoxTokens,
} from '../../src/styles/native-box';
import {
	editorStyle,
	migrateStyleAttributes,
	hasExplicitFontWeight,
} from '../../src/styles/native';
import {
	previewStyle,
	previewTableContext,
	rebasePreviewEnvironment,
} from '../../src/styles/bulk-preview';
import { directionMode, sideValues, updateSides } from '../../src/styles/sides';
import { tokenStyle } from '../../src/styles/tokens';

describe('native styles and directional inheritance', () => {
	it('derives header inheritance only from valid explicit native weights', () => {
		for (const weight of [
			'normal',
			'bold',
			'bolder',
			'lighter',
			'500',
			600,
			450.5,
		]) {
			expect(
				hasExplicitFontWeight({
					style: { typography: { fontWeight: weight } },
				})
			).toBe(true);
		}
		for (const weight of [
			undefined,
			null,
			'',
			0,
			1001,
			NaN,
			Infinity,
			'bold;color:red',
			{},
			[],
		]) {
			expect(
				hasExplicitFontWeight({
					style: { typography: { fontWeight: weight } },
				})
			).toBe(false);
		}
		expect(hasExplicitFontWeight({})).toBe(false);
	});
	it('protects native font family presets from the baseline without storing defaults', () => {
		const attributes = Object.freeze({ fontFamily: 'body' });
		expect(editorStyle(attributes)).toEqual({
			fontFamily: 'var(--wp--preset--font-family--body)',
		});
		expect(attributes).toEqual({ fontFamily: 'body' });
		expect(editorStyle({})).toEqual({});
		expect(editorStyle({ fontFamily: 'bad);color:red' })).toEqual({});
	});
	it('moves only table background to native attributes and keeps cell defaults and box settings', () => {
		const attributes = Object.freeze({
			styleTokens: Object.freeze({
				backgroundColor: 'var(--wp--preset--color--base)',
				cellBackgroundColor: '#abcdef',
				borderWidth: '2px',
			}),
		});
		const migrated = migrateStyleAttributes(attributes);
		expect(migrated).toMatchObject({
			backgroundColor: 'base',
			styleTokens: { cellBackgroundColor: '#abcdef', borderWidth: '2px' },
		});
		expect(migrated.styleTokens).not.toHaveProperty('backgroundColor');
		expect(editorStyle(migrated)).toMatchObject({
			backgroundColor: 'var(--wp--preset--color--base)',
			'--mtb-background-color': 'initial',
		});
		expect(
			migrateStyleAttributes({
				...attributes,
				backgroundColor: 'contrast',
			})
		).toMatchObject({ backgroundColor: 'contrast' });
		expect(
			migrateStyleAttributes({
				...attributes,
				style: { color: { background: '#123456' } },
			})
		).toMatchObject({ style: { color: { background: '#123456' } } });
		expect(migrateStyleAttributes(migrated)).toBe(migrated);
		expect(
			editorStyle({ styleTokens: { cellPaddingTop: '4px' } })
		).not.toHaveProperty('backgroundColor');
	});
	it('previews extended native typography and table background without external dimensions', () => {
		const style = previewStyle({
			fontFamily: 'body',
			backgroundColor: 'base',
			style: {
				typography: {
					fontStyle: 'italic',
					fontWeight: '600',
					letterSpacing: '2px',
					textTransform: 'uppercase',
					textDecoration: 'underline',
					writingMode: 'horizontal-tb',
				},
				dimensions: { minHeight: '400px' },
				spacing: { margin: { top: '50px' } },
			},
		});
		expect(style).toMatchObject({
			fontFamily: 'var(--wp--preset--font-family--body)',
			backgroundColor: 'var(--wp--preset--color--base)',
			fontStyle: 'italic',
			fontWeight: '600',
			letterSpacing: '2px',
			textTransform: 'uppercase',
			textDecoration: 'underline',
		});
		expect(style).not.toHaveProperty('minHeight');
		expect(style).not.toHaveProperty('marginTop');
	});
	it('upgrades saved presets, custom typography and alignment without changing the input', () => {
		const attributes = Object.freeze({
			styleTokens: Object.freeze({
				textColor: 'var(--wp--preset--color--contrast)',
				fontSize: '150%',
				lineHeight: 'normal',
				borderWidth: '3px',
			}),
			horizontalAlign: 'right',
		});
		const next = migrateStyleAttributes(attributes);
		expect(next).toMatchObject({
			textColor: 'contrast',
			style: {
				typography: {
					fontSize: '150%',
					lineHeight: 'normal',
					textAlign: 'right',
				},
			},
			styleTokens: { borderWidth: '3px' },
		});
		expect(next).not.toHaveProperty('horizontalAlign');
		expect(attributes.styleTokens.fontSize).toBe('150%');
		expect(migrateStyleAttributes(next)).toBe(next);
	});
	it('keeps native values ahead of legacy values, preserves other styles and removes old fallback values', () => {
		const next = migrateStyleAttributes({
			fontSize: 'large',
			style: {
				color: { text: '#abcdef' },
				typography: { lineHeight: 1.8 },
				spacing: { margin: { top: '12px' } },
			},
			styleTokens: {
				fontSize: '16px',
				textColor: '#123456',
				lineHeight: 'normal',
			},
		});
		expect(next.styleTokens).toEqual({});
		expect(editorStyle(next)).toMatchObject({
			'--mtb-text-color': 'initial',
			'--mtb-font-size': 'initial',
			'--mtb-line-height': 'initial',
		});
		expect(editorStyle(next)).not.toHaveProperty('fontSize');
		expect(
			editorStyle({ styleTokens: { fontSize: '150%' } })
		).toMatchObject({ fontSize: '150%' });
		expect(next.style?.spacing).toEqual({ margin: { top: '12px' } });
	});
	it('expands local legacy padding and changes only the requested side', () => {
		const tokens = Object.freeze({
			cellPaddingBlock: '12px',
			cellPaddingInline: '24px',
			textColor: '#123456',
		});
		const next = updateSides(tokens, 'padding', ['left'], '2rem');
		expect(next).toEqual({
			cellPaddingTop: '12px',
			cellPaddingRight: '24px',
			cellPaddingBottom: '12px',
			cellPaddingLeft: '2rem',
			textColor: '#123456',
		});
		expect(directionMode(sideValues(next, 'padding'))).toBe('sides');
		expect(updateSides(next, 'padding', ['left'])).not.toHaveProperty(
			'cellPaddingLeft'
		);
		expect(tokens.cellPaddingInline).toBe('24px');
	});
	it('resets a border side to inherit while retaining the other local sides and unrelated attributes', () => {
		const next = updateSides(
			{ borderWidth: '3px', borderColor: '#123456' },
			'borderWidth',
			['top']
		);
		expect(next).toEqual({
			borderRightWidth: '3px',
			borderBottomWidth: '3px',
			borderLeftWidth: '3px',
			borderColor: '#123456',
		});
		expect(
			directionMode({
				top: '1px',
				bottom: '1px',
				right: '2px',
				left: '2px',
			})
		).toBe('axes');
	});
	it('materializes local shorthand values before side overrides so parent sides cannot override a child shorthand', () => {
		expect(
			tokenStyle({
				borderWidth: '2px',
				borderLeftWidth: '0',
				cellPaddingBlock: '12px',
				cellPaddingTop: '3px',
			})
		).toMatchObject({
			'--mtb-cell-border-l-width': '0',
			'--mtb-cell-border-r-width': '2px',
			'--mtb-cell-pt': '3px',
			'--mtb-cell-pb': '12px',
		});
	});
});

describe('standard border and dimensions controls', () => {
	const presets = [
		{
			name: 'Contrast',
			value: 'var(--wp--preset--color--contrast)',
			color: '#111111',
		},
	];
	it('displays solid without creating local tokens, including echoed width/color edits', () => {
		const tokens = Object.freeze({});
		expect(borderControlValue(tokens, [])).toEqual({ style: 'solid' });
		expect(
			applyBorderValue(tokens, borderControlValue(tokens, []), [])
		).toBe(tokens);
		const next = applyBorderValue(
			tokens,
			{ style: 'solid', width: '2px', color: '#123456' },
			[]
		);
		expect(sideValues(next, 'borderWidth')).toEqual({
			top: '2px',
			right: '2px',
			bottom: '2px',
			left: '2px',
		});
		expect(sideValues(next, 'borderStyle')).toEqual({});
		expect(sideValues(next, 'borderColor').top).toBe('#123456');
		expect(tokens).toEqual({});
	});
	it('resolves inherited directional styles and preserves explicit overrides and resets', () => {
		const defaults = borderStyleDefaults([
			{ borderStyle: 'dashed', borderTopStyle: 'dotted' },
			{ borderStyle: 'double', borderLeftStyle: 'none' },
		]);
		expect(defaults).toEqual({
			top: 'double',
			right: 'double',
			bottom: 'double',
			left: 'none',
		});
		const tokens = Object.freeze({ borderWidth: '2px' });
		expect(
			applyBorderValue(
				tokens,
				borderControlValue(tokens, [], defaults),
				[],
				defaults
			)
		).toBe(tokens);
		const next = applyBorderValue(
			tokens,
			{ width: '2px', style: 'solid' },
			[],
			defaults
		);
		expect(sideValues(next, 'borderStyle')).toEqual({
			top: 'solid',
			right: 'solid',
			bottom: 'solid',
			left: 'solid',
		});
		expect(
			applyBorderValue(
				next,
				borderControlValue(next, [], defaults),
				[],
				defaults
			)
		).toBe(next);
		expect(
			sideValues(
				applyBorderValue(next, { width: '2px' }, [], defaults),
				'borderStyle'
			)
		).toEqual({});
		expect(borderStyleDefaults([{ borderStyle: 'invalid' }]).top).toBe(
			'solid'
		);
	});
	it('round trips legacy sides and spacing presets without rewriting stored attributes', () => {
		const tokens = Object.freeze({
			cellPaddingBlock: 'var(--wp--preset--spacing--40)',
			cellPaddingInline: '24px',
			borderWidth: '2px',
			borderColor: presets[0].value,
		});
		expect(paddingControlValue(tokens).top).toBe('var:preset|spacing|40');
		expect(applyPaddingValue(tokens, paddingControlValue(tokens))).toBe(
			tokens
		);
		expect(
			applyBorderValue(
				tokens,
				borderControlValue(tokens, presets),
				presets
			)
		).toBe(tokens);
	});
	it('changes one border side while preserving other sides, custom colors and inherited properties', () => {
		const tokens = Object.freeze({
			borderWidth: '2px',
			borderColor: '#111111',
			cellPaddingTop: '9px',
		});
		const next = applyBorderValue(
			tokens,
			{
				top: { width: '3px', color: '#111111' },
				right: { width: '2px', color: '#111111' },
				bottom: { width: '2px', color: '#111111' },
				left: { width: '2px', color: '#111111' },
			},
			presets
		);
		expect(sideValues(next, 'borderWidth')).toEqual({
			top: '3px',
			right: '2px',
			bottom: '2px',
			left: '2px',
		});
		expect(next.borderColor).toBe('#111111');
		expect(next).not.toHaveProperty('borderStyle');
		expect(resetBoxTokens(next, true)).toEqual({ cellPaddingTop: '9px' });
	});
	it('removes only the cleared padding side and leaves the original data intact', () => {
		const tokens = Object.freeze({
			cellPaddingBlock: '12px',
			cellPaddingInline: '24px',
			borderWidth: '2px',
		});
		const next = applyPaddingValue(tokens, {
			...paddingControlValue(tokens),
			top: undefined,
		});
		expect(next).not.toHaveProperty('cellPaddingTop');
		expect(sideValues(next, 'padding')).toEqual({
			bottom: '12px',
			right: '24px',
			left: '24px',
		});
		expect(resetBoxTokens(next, false)).toEqual({ borderWidth: '2px' });
		expect(tokens.cellPaddingBlock).toBe('12px');
	});
	it('rejects unsupported native values atomically', () => {
		const tokens = Object.freeze({
			borderWidth: '2px',
			cellPaddingBlock: '12px',
		});
		expect(() =>
			applyBorderValue(tokens, { width: 'calc(1px + 2px)' }, presets)
		).toThrow();
		expect(() =>
			applyPaddingValue(tokens, { top: '10px', bottom: '-1px' })
		).toThrow();
		expect(tokens).toEqual({
			borderWidth: '2px',
			cellPaddingBlock: '12px',
		});
	});
});

test('clearing shared values removes the captured local context and restores only matching parent tokens', () => {
	const environment = {
		table: {
			fontSize: '30px',
			lineHeight: '60px',
			'--mtb-cell-border-r-width': '9px',
			'--mtb-cell-border-t-width': '9px',
			'--mtb-cell-bg': '#fff',
		},
		parent: {
			fontSize: '16px',
			'--mtb-cell-border-r-width': '2px',
			'--mtb-cell-border-t-width': '2px',
		},
		blocks: {},
		fontSizes: {},
	};
	const next = previewTableContext(environment, {
		fontSize: undefined,
		'borderWidth.top': undefined,
	});
	expect(next).not.toHaveProperty('fontSize');
	expect(next).toMatchObject({
		'--mtb-cell-border-r-width': '9px',
		'--mtb-cell-border-t-width': '2px',
		'--mtb-cell-bg': '#fff',
		lineHeight: '60px',
	});
	expect(environment.table.fontSize).toBe('30px');
});

test('applied fields discard stale preview captures while retaining unrelated theme values', () => {
	const environment = {
		table: {
			fontSize: '14px',
			color: '#123456',
			'--mtb-cell-bg': '#fff',
		},
		parent: { fontSize: '16px', '--mtb-cell-bg': '#eee' },
		blocks: {
			cell: {
				fontSize: '10px',
				color: '#abcdef',
				'--mtb-cell-bg': '#f00',
			},
		},
		fontSizes: { cell: '10px' },
	};
	const before = JSON.stringify(environment);
	const next = rebasePreviewEnvironment(environment, {
		fontSize: undefined,
		cellBackgroundColor: undefined,
	});
	expect(next.table).toEqual({
		color: '#123456',
		'--mtb-cell-bg': '#eee',
	});
	expect(next.blocks.cell).toEqual({ color: '#abcdef' });
	expect(next.fontSizes).toEqual({});
	expect(next.parent).toBe(environment.parent);
	expect(
		rebasePreviewEnvironment(environment, { lineHeight: undefined })
			.fontSizes
	).toBe(environment.fontSizes);
	expect(JSON.stringify(environment)).toBe(before);
});
