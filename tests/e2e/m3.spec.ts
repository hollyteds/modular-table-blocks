import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openEditor } from './login';
const legacy = {
	textColor: '#1234',
	cellBackgroundColor: 'transparent',
	borderColor: 'currentColor',
	borderWidth: '0',
	borderStyle: 'none',
	cellPaddingBlock: 'var(--wp--preset--spacing--40)',
	cellPaddingInline: '.75em',
	fontSize: '150%',
	lineHeight: 'normal',
};
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate((tokens) => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}],
				caption: 'Accessible table',
				headerRows: 1,
				responsiveMode: 'scroll',
				styleTokens: { textColor: '#112233', fontSize: '16px' },
			},
			[
				[
					createBlock(
						'modular-table-blocks/cell',
						{ styleTokens: tokens },
						[
							createBlock('core/paragraph', {
								content: 'Header one',
							}),
						]
					),
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', {
							content: 'Header two',
						}),
					]),
				],
				[
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', { content: 'Data one' }),
					]),
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', { content: 'Data two' }),
					]),
				],
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			);
	}, legacy);
});
async function expand(page: Page, label: string) {
	const button = page.getByRole('button', { name: label, exact: true });
	if ((await button.getAttribute('aria-expanded')) !== 'true') {
		await button.click();
	}
}
const tokens = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes.styleTokens
	);
test('structure menu and merge dialog work with the keyboard and return focus', async ({
	page,
}) => {
	const toggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Table structure', exact: true });
	await toggle.focus();
	await toggle.press('Enter');
	await expect(
		page
			.getByRole('menu', { name: 'Table structure', exact: true })
			.getByRole('menuitem', { name: 'Merge cells', exact: true })
	).toHaveCount(0);
	await page.keyboard.press('Escape');
	const mergeButton = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Merge and split cells', exact: true });
	await expect(mergeButton).toHaveAttribute('aria-pressed', 'false');
	await mergeButton.focus();
	await mergeButton.press('Enter');
	await expect(
		page.getByRole('menu', { name: 'Merge and split cells', exact: true })
	).toHaveCount(0);
	const dialog = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await expect(dialog).toBeVisible();
	await expect
		.poll(() =>
			dialog.evaluate((node) =>
				node.contains(node.ownerDocument.activeElement)
			)
		)
		.toBe(true);
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(mergeButton).toBeFocused();
	expect(await tokens(page)).toEqual(legacy);
});
async function save(page: Page) {
	await page.evaluate(() => {
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'M3 quality', status: 'publish' });
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
}
test('directional native controls preserve values and column modes keep blank widths unset and saved widths retained', async ({
	page,
}) => {
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	expect(await tokens(page)).toEqual(legacy);
	const borders = page.locator('.modular-table-blocks-border-control');
	const width = borders.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('2');
	await width.press('Tab');
	await width.fill('0');
	await width.press('Tab');
	await expand(page, 'Background');
	expect(await tokens(page)).toMatchObject({
		borderTopWidth: '0px',
		borderRightWidth: '0px',
		borderBottomWidth: '0px',
		borderLeftWidth: '0px',
	});
	const background = page.locator(
		'.modular-table-blocks-style-control[aria-label="Cell background"]'
	);
	await background
		.getByRole('button', { name: 'Cell background', exact: true })
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	expect(await tokens(page)).toMatchObject({
		cellBackgroundColor: 'var(--wp--preset--color--contrast)',
	});
	await page.keyboard.press('Escape');
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await expect(
		page.getByRole('group', { name: 'Column widths', exact: true })
	).toBeVisible();
	await page
		.getByRole('radio', { name: 'Custom widths', exact: true })
		.click();
	const column = page.getByRole('group', {
		name: 'Column 1 width',
		exact: true,
	});
	await column
		.getByRole('combobox', { name: 'Select unit', exact: true })
		.selectOption('px');
	await expect(
		column.getByRole('spinbutton', { name: 'Column 1 width', exact: true })
	).toHaveValue('');
	expect(
		await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.attributes.columns
		)
	).toEqual([{}, {}]);
	await column
		.getByRole('spinbutton', { name: 'Column 1 width', exact: true })
		.fill('900');
	await column
		.getByRole('spinbutton', { name: 'Column 1 width', exact: true })
		.press('Tab');
	expect(
		await page.evaluate(
			() =>
				(
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.attributes.columns as Array<{
						width?: string;
					}>
				)[0].width
		)
	).toBe('900px');
	await page
		.getByRole('radio', { name: 'Automatic width', exact: true })
		.click();
	await save(page);
	await page.reload();
	await page.waitForFunction(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]?.name ===
			'modular-table-blocks/table'
	);
	expect(await tokens(page)).toMatchObject({
		borderLeftWidth: '0px',
		cellBackgroundColor: 'var(--wp--preset--color--contrast)',
	});
});
test('editor controls and public table pass scoped accessibility checks and keyboard focus remains visible', async ({
	page,
}) => {
	// Audit a readable fixture; user-selected low contrast colors are not forced.
	await page.evaluate(() => {
		const cell = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, { styleTokens: {} });
	});
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const editor = await new AxeBuilder({ page })
		.include('.modular-table-blocks-style-control')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze();
	expect(editor.violations).toEqual([]);
	await page.screenshot({
		path: test.info().outputPath('m3-style-controls.png'),
		fullPage: true,
	});
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await cell.locator('[contenteditable="true"]').focus();
	await expect(cell).toHaveCSS('outline-style', 'solid');
	await expect(cell).toHaveCSS('outline-width', '2px');
	await save(page);
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${postId}`);
	const region = page.getByRole('region', {
		name: 'Accessible table',
		exact: true,
	});
	await expect(region.getByRole('columnheader')).toHaveCount(2);
	const front = await new AxeBuilder({ page })
		.include('.modular-table-blocks-scroll')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze();
	expect(front.violations).toEqual([]);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.bringToFront();
	await region.scrollIntoViewIfNeeded();
	await region.focus();
	// WebKit starts native scrolling on an animation frame while the key is down.
	await page.keyboard.press('ArrowRight', { delay: 100 });
	await test.info().attach('scroll-diagnostics.json', {
		body: JSON.stringify(
			await region.evaluate((node) => ({
				width: node.clientWidth,
				scrollWidth: node.scrollWidth,
				left: node.scrollLeft,
				focused: node.ownerDocument.activeElement === node,
				documentFocused: node.ownerDocument.hasFocus(),
				overflow: getComputedStyle(node).overflowX,
			}))
		),
		contentType: 'application/json',
	});
	await expect(region).toBeFocused();
	await expect
		.poll(() => region.evaluate((node) => node.scrollLeft))
		.toBeGreaterThan(0);
	await page.screenshot({
		path: test.info().outputPath('m3-accessible-public.png'),
		fullPage: true,
	});
});
