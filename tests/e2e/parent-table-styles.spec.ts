import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';

async function fixture(page: Page) {
	await page.evaluate(() => {
		const cell = (text: string) =>
			window.wp.blocks.createBlock('modular-table-blocks/cell', {}, [
				window.wp.blocks.createBlock('modular-table-blocks/cell-text', {
					content: text,
				}),
			]);
		const table = window.mtbCreateTable({ columns: [{}, {}] }, [
			[cell('First'), cell('Second')],
			[cell('Third'), cell('Fourth')],
		]);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	if (!(await page.locator('.block-editor-block-inspector').isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
	const block = page.getByRole('tab', { name: 'Block', exact: true });
	if (await block.isVisible()) {
		await block.click();
	}
}
const attrs = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0].attributes
	);
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
async function update(page: Page, attributes: Record<string, unknown>) {
	await page.evaluate((next) => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, next);
	}, attributes);
}

test('parent routes common cell styling through bulk editing and keeps native table styles separate', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Table styles', exact: true })
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Cell background', exact: true })
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Cell styles', exact: true })
	).toHaveCount(0);
	const before = await attrs(page);
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	await expect(
		modal.getByRole('region', { name: 'Border', exact: true })
	).toBeVisible();
	const width = modal.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('3');
	await width.press('Tab');
	expect(await attrs(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Apply to 4 cells', exact: true })
		.click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell').first()
	).toHaveCSS('border-top-width', '3px');
	expect((await attrs(page)).styleTokens).toMatchObject({
		borderTopWidth: '3px',
	});
	await page
		.getByRole('spinbutton', { name: 'Table width', exact: true })
		.fill('80');
	await page.keyboard.press('Tab');
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await expect(
		page.locator('.modular-table-blocks-border-control')
	).toHaveCount(0);
	await expect(
		page.locator('.modular-table-blocks-padding-control')
	).toHaveCount(0);
	await expect(page.locator('.dimensions-block-support-panel')).toContainText(
		'Margin'
	);
	await expect(page.locator('.dimensions-block-support-panel')).toContainText(
		'Minimum height'
	);
	await expect(
		page.locator('.dimensions-block-support-panel')
	).not.toContainText('Padding');
	await expect(
		page
			.locator('.block-editor-block-inspector')
			.getByText('Shadow', { exact: true })
	).toHaveCount(0);
});

test('native table typography background and dimensions survive save and render on the table', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const font = await page.evaluate(() => {
		const features = window.wp.data
			.select('core/block-editor')
			.getSettings().__experimentalFeatures as {
			typography: {
				fontFamilies: { theme: { slug: string; fontFamily: string }[] };
			};
		};
		return features.typography.fontFamilies.theme.slice(-1)[0];
	});
	await update(page, {
		backgroundColor: 'contrast',
		fontFamily: font.slug,
		style: {
			typography: {
				fontSize: '24px',
				fontStyle: 'italic',
				fontWeight: '600',
				letterSpacing: '2px',
				lineHeight: '1.8',
				textTransform: 'uppercase',
				textDecoration: 'underline',
			},
			spacing: { margin: { top: '23px', bottom: '29px' } },
			dimensions: { minHeight: '360px' },
		},
		styleTokens: {
			cellPaddingBlock: '15px',
			cellPaddingInline: '19px',
			borderWidth: '2px',
			borderColor: '#123456',
		},
	});
	const table = canvas(page).locator('.modular-table-blocks-editor');
	const cell = canvas(page)
		.locator('.modular-table-blocks-editor__cell')
		.first();
	const family = await table.evaluate(
		(node) => getComputedStyle(node).fontFamily
	);
	expect(family).toContain(
		font.fontFamily.split(',')[0].replace(/[\"']/g, '').trim()
	);
	for (const node of [table, cell]) {
		await expect(node).toHaveCSS('font-family', family);
		await expect(node).toHaveCSS('font-weight', '600');
		await expect(node).toHaveCSS('font-style', 'italic');
		await expect(node).toHaveCSS('letter-spacing', '2px');
		await expect(node).toHaveCSS('text-transform', 'uppercase');
	}
	await expect(table).toHaveCSS('min-height', '360px');
	await expect(table).toHaveCSS('margin-top', '23px');
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await expect(
		page.getByRole('spinbutton', { name: 'Letter spacing', exact: true })
	).toBeVisible();
	await page
		.getByRole('spinbutton', { name: 'Letter spacing', exact: true })
		.fill('3');
	await page
		.getByRole('spinbutton', { name: 'Letter spacing', exact: true })
		.press('Tab');
	await expect(cell).toHaveCSS('letter-spacing', '3px');
	const background = await table.evaluate(
		(node) => getComputedStyle(node).backgroundColor
	);
	expect(background).not.toBe('rgba(0, 0, 0, 0)');
	await expect(cell).toHaveCSS('padding-top', '15px');
	await expect(cell).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	expect((await cell.boundingBox())!.height).toBeGreaterThan(130);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const preview = page.locator('.modular-table-blocks-bulk-preview-table');
	await expect(preview).toHaveCSS('font-family', family);
	await expect(preview).toHaveCSS('letter-spacing', '3px');
	await expect(preview).toHaveCSS('background-color', background);
	await expect(preview).toHaveCSS('min-height', '0px');
	await page.getByRole('dialog').press('Escape');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(table).toHaveCSS('min-height', '360px');
	expect(
		await page.evaluate(() =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()
				.every((block) => block.isValid)
		)
	).toBe(true);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicTable = page.locator(
		'table.wp-block-modular-table-blocks-table'
	);
	await expect(publicTable).toHaveCSS('background-color', background);
	await expect(publicTable).toHaveCSS('min-height', '360px');
	await expect(publicTable.locator('..')).toHaveCSS('margin-top', '23px');
	await expect(publicTable).toHaveCSS('margin-top', '0px');
	expect((await publicTable.boundingBox())!.height).toBeGreaterThanOrEqual(
		359
	);
	const publicCell = publicTable.locator('td').first();
	await expect(publicCell).toHaveCSS('font-family', family);
	await expect(publicCell).toHaveCSS('font-style', 'italic');
	await expect(publicCell).toHaveCSS('font-weight', '600');
	await expect(publicCell).toHaveCSS('letter-spacing', '3px');
	await expect(publicCell).toHaveCSS('text-transform', 'uppercase');
	await expect(publicCell).toHaveCSS('padding-top', '15px');
	await expect(publicTable).toHaveCSS('border-top-width', '0px');
	await expect(publicTable.locator('tbody > tr > td')).toHaveCount(4);
});

test('native table presets use standard classes without redundant inline styles and keep cell inheritance', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const preset = {
			fontSize: 'large',
			backgroundColor: 'contrast',
			textColor: 'base',
			fontFamily: 'body',
		};
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, preset);
		window.wp.data.dispatch('core/block-editor').insertBlocks([
			window.wp.blocks.createBlock('core/paragraph', {
				...preset,
				className: 'mtb-native-preset-reference',
				content: 'Native preset reference',
			}),
		]);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Native table presets', status: 'publish' });
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	await page.addStyleTag({
		content:
			'.wp-block-post-content, .entry-content { --mtb-font-size:72px; --mtb-background-color:#ffff00; --mtb-text-color:#ff0000; }',
	});
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	const reference = page.locator('.mtb-native-preset-reference');
	for (const className of [
		'has-large-font-size',
		'has-contrast-background-color',
		'has-base-color',
		'has-body-font-family',
	]) {
		await expect(table).toHaveClass(new RegExp(className));
	}
	for (const property of [
		'font-size',
		'background-color',
		'color',
		'font-family',
	]) {
		expect(
			await table.evaluate(
				(node, key) =>
					(node as HTMLElement).style.getPropertyValue(key),
				property
			)
		).toBe('');
		const expected = await reference.evaluate(
			(node, key) => getComputedStyle(node).getPropertyValue(key),
			property
		);
		await expect(table).toHaveCSS(property, expected);
		if (property !== 'background-color') {
			await expect(table.locator('td').first()).toHaveCSS(
				property,
				expected
			);
		}
	}
});

test('native table background palette uses theme colors and clear restores site fallback', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await page
		.locator('.color-block-support-panel, .background-block-support-panel')
		.getByRole('button', { name: /^(Color Background styles|Color)$/ })
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await expect
		.poll(async () => (await attrs(page)).backgroundColor)
		.toBe('contrast');
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	await page.keyboard.press('Escape');
	expect((await attrs(page)).backgroundColor).toBeUndefined();
	expect((await attrs(page)).styleTokens).toBeUndefined();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor')
	).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
