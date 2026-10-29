import {
	lengthValue,
	lengthBounds,
	themePresets,
	colorPresets,
	colorPresetSettings,
} from '../../src/styles/controls';
import { isValidToken } from '../../src/styles/tokens';

test('saved dimensions retain decimal precision and zero without converting presets', () => {
	expect(lengthValue('.753em')).toEqual({ amount: 0.753, unit: 'em' });
	expect(lengthValue('0')).toEqual({ amount: 0, unit: 'px' });
	for (const value of [
		'var(--wp--preset--spacing--40)',
		'',
		'normal',
		'12px;position:fixed',
	]) {
		expect(lengthValue(value)).toBeUndefined();
	}
});

test('theme colors accept CSS color notation while only safe preset references are saved', () => {
	expect(
		themePresets(
			[
				{ name: 'RGB', slug: 'brand', color: 'rgb(12, 34, 56)' },
				{
					name: 'Variable',
					slug: 'surface',
					color: 'var(--theme-surface)',
				},
				{ name: 'Bad slug', slug: 'bad);color:red', color: '#123456' },
				{
					name: 'Bad value',
					slug: 'bad',
					color: '#fff;background:red',
				},
			],
			'borderColor'
		)
	).toEqual([
		{
			name: 'RGB',
			value: 'var(--wp--preset--color--brand)',
			color: 'rgb(12, 34, 56)',
		},
		{
			name: 'Variable',
			value: 'var(--wp--preset--color--surface)',
			color: 'var(--theme-surface)',
		},
	]);
});

test('current palette settings take priority, including user overrides and explicit empty palettes', () => {
	const color = (name: string, colorValue: string) => ({
		name,
		slug: 'brand',
		color: colorValue,
	});
	const legacy = [color('Legacy', '#000000')];
	const theme = [color('Theme', '#112233')];
	const custom = [color('Site override', '#445566')];
	const defaults = [{ name: 'Default', slug: 'default', color: '#ffffff' }];
	expect(
		colorPresets(
			{ theme, custom, defaults, defaultPalette: false },
			legacy,
			'borderColor'
		)
	).toEqual([
		{
			name: 'Site override',
			color: '#445566',
			value: 'var(--wp--preset--color--brand)',
		},
	]);
	expect(
		colorPresets(
			{ theme, defaults, defaultPalette: false },
			legacy,
			'borderColor'
		)[0].name
	).toBe('Theme');
	expect(
		colorPresets(
			{ theme: [], defaults, defaultPalette: false },
			legacy,
			'borderColor'
		)
	).toEqual([]);
	expect(colorPresets({}, legacy, 'borderColor')[0].name).toBe('Legacy');
	expect(
		colorPresets(
			{ theme, defaults, defaultPalette: true },
			legacy,
			'borderColor'
		)
	).toHaveLength(2);
});
test('palette origins keep native ordering without reviving overridden or disabled presets', () => {
	const color = (slug: string, value: string) => ({
		name: slug,
		slug,
		color: value,
	});
	const settings = {
		theme: [color('brand', '#111111'), color('theme-only', '#222222')],
		custom: [color('brand', '#333333')],
		defaults: [color('default', '#ffffff')],
		defaultPalette: true,
	};
	const result = colorPresetSettings(settings, [], 'borderColor');
	expect(result.groups.map((group) => group.origin)).toEqual([
		'theme',
		'default',
		'custom',
	]);
	expect(
		result.groups.map((group) => group.presets.map((preset) => preset.name))
	).toEqual([['theme-only'], ['default'], ['brand']]);
	expect(result.presets[0]).toMatchObject({
		name: 'brand',
		color: '#333333',
	});
	expect(
		colorPresetSettings(
			{ ...settings, defaultPalette: false },
			[],
			'borderColor'
		).groups.map((group) => group.origin)
	).toEqual(['theme', 'custom']);
	expect(
		colorPresetSettings(
			{ theme: [], defaultPalette: false },
			[color('legacy', '#444444')],
			'textColor'
		)
	).toEqual({ presets: [], groups: [] });
	const legacy = colorPresetSettings(
		{},
		[color('legacy', '#444444')],
		'textColor'
	);
	expect(legacy.presets).toHaveLength(1);
	expect(legacy.groups).toEqual([]);
});

test('control boundaries emit values accepted by the persistent schema', () => {
	const width = lengthBounds('tableWidth', 'px');
	expect((900 - width.min) / width.step).toBeCloseTo(
		Math.round((900 - width.min) / width.step)
	);
	for (const kind of [
		'tableWidth',
		'fontSize',
		'borderWidth',
		'cellPaddingInline',
	] as const) {
		for (const unit of ['px', 'em', 'rem', '%'] as const) {
			if (
				unit === '%' &&
				(kind === 'borderWidth' || kind === 'cellPaddingInline')
			) {
				continue;
			}
			const bounds = lengthBounds(kind, unit);
			expect(isValidToken(kind, `${bounds.min}${unit}`)).toBe(true);
			expect(isValidToken(kind, `${bounds.max}${unit}`)).toBe(true);
		}
	}
});
test('preset references validate slugs and preserve fluid theme font sizes through variables', () => {
	expect(
		themePresets(
			[
				{ name: 'Fluid', slug: 'fluid', size: 'clamp(1rem,2vw,2rem)' },
				{ name: 'Unsafe', slug: 'bad);color:red' },
				null,
			],
			'fontSize'
		)
	).toEqual([
		{ name: 'Fluid', value: 'var(--wp--preset--font-size--fluid)' },
	]);
	expect(
		themePresets(
			{ theme: [{ name: 'Space', slug: '40' }] },
			'cellPaddingBlock'
		)
	).toEqual([{ name: 'Space', value: 'var(--wp--preset--spacing--40)' }]);
	expect(themePresets(null, 'textColor')).toEqual([]);
});
