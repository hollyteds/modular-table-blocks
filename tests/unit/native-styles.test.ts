import {
	applyBorderValue,
	applyPaddingValue,
	borderControlValue,
	paddingControlValue,
	resetBoxTokens,
} from '../../src/styles/native-box';
import { editorStyle, migrateStyleAttributes } from '../../src/styles/native';
import { directionMode, sideValues, updateSides } from '../../src/styles/sides';
import { tokenStyle } from '../../src/styles/tokens';

describe('native styles and directional inheritance', () => {
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
			'--mtb-border-left-width': '0',
			'--mtb-border-right-width': '2px',
			'--mtb-cell-padding-top': '3px',
			'--mtb-cell-padding-bottom': '12px',
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
