import { test, expect } from '@playwright/test';
import { openEditor } from './login';
import type { Page } from '@playwright/test';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	runtimeErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (
			message.type() === 'error' &&
			message.text() !==
				'Warning: You are importing createRoot from "react-dom" which is not supported. You should instead import it from "react-dom/client".'
		) {
			errors.push(message.text());
		}
	});
});
test.afterEach(async ({ page }) => {
	expect(runtimeErrors.get(page)).toEqual([]);
});

async function fixture(page: Page) {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (text: string, attributes = {}) =>
			createBlock('modular-table-blocks/cell', attributes, [
				createBlock('core/paragraph', { content: text }),
			]);
		const table = createBlock(
			'modular-table-blocks/table',
			{
				columns: [{}, {}],
				style: {
					typography: { fontSize: '150%', lineHeight: '1.5' },
					color: { text: '#123456' },
				},
				styleTokens: {
					cellPaddingBlock: '11px',
					cellPaddingInline: '13px',
					borderWidth: '2px',
					borderColor: '#112233',
					borderStyle: 'solid',
				},
			},
			[
				createBlock('modular-table-blocks/row', {}, [
					cell('First', {
						styleTokens: {
							cellPaddingBlock: '12px',
							cellPaddingInline: '24px',
						},
					}),
					cell('Second'),
				]),
				createBlock('modular-table-blocks/row', {}, [
					cell('Third'),
					cell('Fourth'),
				]),
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[0].innerBlocks[0].clientId);
	});
}
const tokens = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]
				.innerBlocks[0].innerBlocks[0].attributes.styleTokens as Record<
				string,
				string
			>
	);

test('standard panels preserve directional values through undo, save and reload', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const padding = page.locator('.modular-table-blocks-padding-control');
	const border = page.locator('.modular-table-blocks-border-control');
	await expect(page.locator('.dimensions-block-support-panel')).toContainText(
		'Padding'
	);
	await expect(page.locator('.border-block-support-panel')).toContainText(
		'Border'
	);
	await expect(
		page
			.locator('.block-editor-block-inspector')
			.getByText('Shadow', { exact: true })
	).toHaveCount(0);
	const before = await tokens(page);
	const options = padding.getByRole('button', {
		name: 'Padding options',
		exact: true,
	});
	if (await options.count()) {
		for (const name of ['Custom', 'Horizontal & vertical', 'Custom']) {
			await options.click();
			await page
				.getByRole('menuitemradio', { name, exact: true })
				.click();
		}
	} else {
		await padding
			.getByRole('button', { name: 'Unlink sides', exact: true })
			.click();
		await padding
			.getByRole('button', { name: 'Link sides', exact: true })
			.click();
		await padding
			.getByRole('button', { name: 'Unlink sides', exact: true })
			.click();
	}
	expect(await tokens(page)).toEqual(before);
	const top = padding.getByRole('spinbutton').first();
	await top.fill('5');
	await top.press('Tab');
	expect(await tokens(page)).toMatchObject({
		cellPaddingTop: '5px',
		cellPaddingBottom: '12px',
		cellPaddingLeft: '24px',
		cellPaddingRight: '24px',
	});
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await expect(cell).toHaveCSS('padding-top', '5px');
	await expect(cell).toHaveCSS('padding-right', '24px');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await top.fill('');
	await top.press('Tab');
	await expect(cell).toHaveCSS('padding-top', '11px');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect(cell).toHaveCSS('padding-top', '5px');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect(cell).toHaveCSS('padding-top', '11px');
	const borderBefore = await tokens(page);
	await border
		.getByRole('button', { name: 'Unlink sides', exact: true })
		.click();
	await border
		.getByRole('button', { name: 'Link sides', exact: true })
		.click();
	await border
		.getByRole('button', { name: 'Unlink sides', exact: true })
		.click();
	expect(await tokens(page)).toEqual(borderBefore);
	const left = border.getByRole('group', {
		name: 'Left border',
		exact: true,
	});
	await left
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.fill('0');
	await left
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.press('Tab');
	await expect(cell).toHaveCSS('border-left-width', '0px');
	const topBorder = border.getByRole('group', {
		name: 'Top border',
		exact: true,
	});
	await topBorder
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.fill('3');
	await topBorder
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.press('Tab');
	await topBorder
		.getByRole('button', {
			name: 'Border color and style picker.',
			exact: true,
		})
		.click();
	await page.getByRole('button', { name: 'Dashed', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(cell).toHaveCSS('border-top-style', 'dashed');
	await page.screenshot({
		path: test.info().outputPath('directional-controls.png'),
		fullPage: true,
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS('padding-top', '11px');
	await expect(cell).toHaveCSS('padding-right', '24px');
	await expect(cell).toHaveCSS('border-left-width', '0px');
	await expect(cell).toHaveCSS('border-top-style', 'dashed');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCell = page
		.locator('table.wp-block-modular-table-blocks-table td')
		.first();
	await expect(publicCell).toHaveCSS('padding-top', '11px');
	await expect(publicCell).toHaveCSS('padding-right', '24px');
	await expect(publicCell).toHaveCSS('border-left-width', '0px');
	await expect(publicCell).toHaveCSS('border-top-style', 'dashed');
});

test('native typography inherits once and legacy parsed attributes migrate without losing content', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const table = canvas.locator('.modular-table-blocks-editor').first();
	const cell = canvas.locator('.modular-table-blocks-editor__cell').first();
	const size = await table.evaluate(
		(node) => getComputedStyle(node).fontSize
	);
	await table.evaluate((node) => {
		node.ownerDocument.body.style.setProperty('--mtb-font-size', '2em');
		node.ownerDocument.body.style.setProperty(
			'--mtb-text-color',
			'#ff0000'
		);
	});
	await expect(cell).toHaveCSS('font-size', size);
	await expect(cell).toHaveCSS('color', 'rgb(18, 52, 86)');
	await page.evaluate(() => {
		const { createBlock, serialize, parse } = window.wp.blocks;
		const legacy = createBlock(
			'modular-table-blocks/table',
			{
				columns: [{}],
				styleTokens: {
					fontSize: '1.5em',
					lineHeight: 'normal',
					textColor: 'var(--wp--preset--color--contrast)',
				},
			},
			[
				createBlock('modular-table-blocks/row', {}, [
					createBlock(
						'modular-table-blocks/cell',
						{ horizontalAlign: 'right' },
						[
							createBlock('core/paragraph', {
								content: 'Legacy content',
							}),
						]
					),
				]),
			]
		);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks(parse(serialize([legacy])));
	});
	const attrs = await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		return {
			table: block.attributes,
			cell: block.innerBlocks[0].innerBlocks[0].attributes,
		};
	});
	expect(attrs.table).toMatchObject({
		textColor: 'contrast',
		style: { typography: { fontSize: '1.5em', lineHeight: 'normal' } },
	});
	expect(attrs.table.styleTokens).not.toHaveProperty('fontSize');
	expect(attrs.cell.style).toMatchObject({
		typography: { textAlign: 'right' },
	});
	await expect(cell).toHaveCSS('text-align', 'right');
	await expect(cell).toHaveCSS(
		'font-size',
		await table.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toContainText('Legacy content');
	await expect(cell).toHaveCSS('text-align', 'right');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicTable = page.locator(
		'table.wp-block-modular-table-blocks-table'
	);
	const publicCell = publicTable.locator('td');
	await page.addStyleTag({
		content: ':root { --mtb-font-size: 2em; --mtb-text-color: #ff0000; }',
	});
	await expect(publicCell).toHaveCSS(
		'font-size',
		await publicTable.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await expect(publicCell).toHaveCSS('text-align', 'right');
	await expect(publicCell).toContainText('Legacy content');
});

test('the standard typography inspector writes a custom cell size to native attributes', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const font = page.getByRole('group', { name: 'Font size', exact: true });
	if (!(await font.count())) {
		await page
			.getByRole('button', { name: 'Typography options', exact: true })
			.click();
		await page
			.getByRole('menuitemcheckbox', {
				name: /^(Show )?(Font size|Size)$/,
			})
			.click({ timeout: 5000 });
		await page.keyboard.press('Escape');
	}
	await page.getByRole('button', { name: /Set custom (size|value)/ }).click();
	const input = font.getByRole('spinbutton').first();
	await input.fill('32');
	await input.press('Tab');
	const attrs = await page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]
				.innerBlocks[0].innerBlocks[0].attributes
	);
	expect(
		String(
			(attrs.style as { typography: { fontSize: string | number } })
				.typography.fontSize
		)
	).toMatch(/^32(?:px)?$/);
	expect(attrs.styleTokens).not.toHaveProperty('fontSize');

	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const style = table.innerBlocks[0].innerBlocks[0].attributes.style as {
			typography: { fontSize: string | number };
		};
		window.wp.data.dispatch('core/block-editor').insertBlocks([
			window.wp.blocks.createBlock('core/paragraph', {
				className: 'mtb-size-reference',
				content: 'Native size reference',
				style: {
					typography: { fontSize: style.typography.fontSize },
				},
			}),
		]);
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const cell = canvas.locator('.modular-table-blocks-editor__cell').first();
	const reference = canvas.locator('.mtb-size-reference');
	await expect(cell).toHaveCSS(
		'font-size',
		await reference.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS(
		'font-size',
		await reference.evaluate((node) => getComputedStyle(node).fontSize)
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table td').first()
	).toHaveCSS(
		'font-size',
		await page
			.locator('.mtb-size-reference')
			.evaluate((node) => getComputedStyle(node).fontSize)
	);
});

test('style components available in the supported WordPress editor', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	const exports = await page.evaluate(() => {
		const wp = window.wp as unknown as {
			components: Record<string, unknown>;
			blockEditor: Record<string, unknown>;
		};
		return Object.fromEntries(
			[
				'UnitControl',
				'__experimentalUnitControl',
				'BorderBoxControl',
				'__experimentalBorderBoxControl',
				'__experimentalSpacingSizesControl',
				'__experimentalToolsPanelItem',
				'ColorPaletteControl',
			].map((key) => [
				key,
				Boolean(wp.components[key] || wp.blockEditor[key]),
			])
		);
	});
	expect(exports.UnitControl || exports.__experimentalUnitControl).toBe(true);
	expect(
		exports.BorderBoxControl || exports.__experimentalBorderBoxControl
	).toBe(true);
	expect(exports.ColorPaletteControl).toBe(true);
	expect(exports.__experimentalSpacingSizesControl).toBe(true);
	expect(exports.__experimentalToolsPanelItem).toBe(true);
});

test('standard panel resets preserve later edits in the other panel', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const border = page.locator('.modular-table-blocks-border-control');
	const width = border.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('3');
	await width.press('Tab');
	await border
		.getByRole('button', {
			name: 'Border color and style picker.',
			exact: true,
		})
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await page.keyboard.press('Escape');
	expect(await tokens(page)).toMatchObject({
		borderTopWidth: '3px',
		borderTopColor: 'var(--wp--preset--color--contrast)',
	});
	await page.evaluate(() => {
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[0].innerBlocks[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, {
				styleTokens: {
					...(cell.attributes.styleTokens as Record<string, string>),
					cellPaddingTop: '7px',
				},
			});
	});
	const beforeInvalid = await tokens(page);
	await width.fill('99');
	await width.press('Tab');
	await expect(border).toContainText('Unsupported value or unit.');
	expect(await tokens(page)).toEqual(beforeInvalid);

	await page
		.locator('.border-block-support-panel')
		.getByRole('button', { name: /^(?:Border|Borders) options$/ })
		.click();
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	const afterBorder = await tokens(page);
	await expect(border).not.toContainText('Unsupported value or unit.');
	expect(afterBorder).toMatchObject({
		cellPaddingTop: '7px',
		cellPaddingBlock: '12px',
		cellPaddingInline: '24px',
	});
	expect(
		Object.keys(afterBorder).some((key) => key.startsWith('border'))
	).toBe(false);
	// Edit the other panel after registration so a stale reset closure would lose this value.
	await width.fill('4');
	await width.press('Tab');
	await page
		.locator('.dimensions-block-support-panel')
		.getByRole('button', { name: 'Dimensions options', exact: true })
		.click();
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	const afterPadding = await tokens(page);
	expect(afterPadding).toMatchObject({
		borderTopWidth: '4px',
		borderLeftWidth: '4px',
	});
	expect(
		Object.keys(afterPadding).some((key) => key.startsWith('cellPadding'))
	).toBe(false);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await page.waitForFunction(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]?.name ===
			'modular-table-blocks/table'
	);
	expect(await tokens(page)).toEqual(afterPadding);
});

for (const scoped of [false, true]) {
	test(`current ${scoped ? 'block-specific' : 'theme'} palette supplies background and border colors`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await fixture(page);
		await expect(
			page
				.frameLocator('iframe[name="editor-canvas"]')
				.locator('.modular-table-blocks-editor__cell')
				.first()
		).toBeVisible();
		await page.evaluate((blockScoped) => {
			const store = window.wp.data.select('core/block-editor');
			const settings = store.getSettings();
			const features = settings.__experimentalFeatures as {
				color?: Record<string, unknown>;
				blocks?: Record<string, { color?: Record<string, unknown> }>;
			};
			const color = {
				...features.color,
				custom: false,
				defaultPalette: false,
				palette: {
					theme: [
						{
							name: 'MTB Theme Accent',
							slug: 'mtb-theme-accent',
							color: 'rgb(12, 34, 56)',
						},
					],
					custom: [
						{
							name: 'MTB Site Accent',
							slug: 'mtb-site-accent',
							color: '#654321',
						},
					],
					default: [
						{
							name: 'MTB Hidden Default',
							slug: 'mtb-hidden-default',
							color: '#fff',
						},
					],
				},
			};
			window.wp.data.dispatch('core/block-editor').updateSettings({
				...settings,
				colors: [
					{
						name: 'MTB Legacy Color',
						slug: 'mtb-legacy',
						color: '#ff0000',
					},
				],
				__experimentalFeatures: {
					...features,
					...(blockScoped
						? {
								blocks: {
									...features.blocks,
									'modular-table-blocks/cell': {
										...features.blocks?.[
											'modular-table-blocks/cell'
										],
										color,
									},
								},
							}
						: { color }),
				},
			});
		}, scoped);
		const settings = page.getByRole('tab', {
			name: 'Settings',
			exact: true,
		});
		if (await settings.count()) {
			await settings.click();
		}
		const panel = page.getByRole('button', {
			name: 'Table styles',
			exact: true,
		});
		if ((await panel.getAttribute('aria-expanded')) !== 'true') {
			await panel.click();
		}
		await page
			.getByRole('button', { name: 'Cell background', exact: true })
			.click();
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Site Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', {
				name: /MTB Legacy Color|MTB Hidden Default/,
			})
		).toHaveCount(0);
		await page
			.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
			.click();
		await page.keyboard.press('Escape');
		expect(await tokens(page)).toMatchObject({
			cellBackgroundColor: 'var(--wp--preset--color--mtb-theme-accent)',
		});
		await page.getByRole('tab', { name: 'Styles', exact: true }).click();
		const border = page.locator('.modular-table-blocks-border-control');
		await border
			.getByRole('spinbutton', { name: 'Border width', exact: true })
			.fill('2');
		await border
			.getByRole('spinbutton', { name: 'Border width', exact: true })
			.press('Tab');
		await border
			.getByRole('button', {
				name: 'Border color and style picker.',
				exact: true,
			})
			.click();
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', {
				name: /MTB Legacy Color|MTB Hidden Default/,
			})
		).toHaveCount(0);
		await page
			.getByRole('option', { name: /^(?:Color: )?MTB Site Accent$/ })
			.click();
		await page.keyboard.press('Escape');
		expect(await tokens(page)).toMatchObject({
			borderTopColor: 'var(--wp--preset--color--mtb-site-accent)',
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		await page.reload();
		await page.waitForFunction(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					?.name === 'modular-table-blocks/table'
		);
		expect(await tokens(page)).toMatchObject({
			cellBackgroundColor: 'var(--wp--preset--color--mtb-theme-accent)',
			borderTopColor: 'var(--wp--preset--color--mtb-site-accent)',
		});
	});
}
