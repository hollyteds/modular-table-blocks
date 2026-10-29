import { test, expect } from '@playwright/test';
import { openEditor } from './login';
import {
	showBulkTypography,
	applyBulkSettings,
	resetBulkPanel,
} from './bulk-controls';

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const settings = window.wp.data
			.select('core/block-editor')
			.getSettings();
		const features = settings.__experimentalFeatures as Record<
			string,
			unknown
		>;
		// Keep fixture settings when the editor provider refreshes block settings.
		window.wp.data.dispatch('core/editor').updateEditorSettings({
			__experimentalFeatures: {
				...features,
				color: {
					...(features.color as object),
					palette: {
						theme: [
							{
								slug: 'bulk-ink',
								name: 'Bulk ink',
								color: '#204060',
							},
						],
					},
				},
				typography: {
					...(features.typography as object),
					customFontSize: true,
					fontFamilies: {
						theme: [
							{
								slug: 'bulk-mono',
								name: 'Bulk Mono',
								fontFamily: 'monospace',
							},
						],
					},
					fontSizes: {
						theme: [
							{
								slug: 'bulk-large',
								name: 'Bulk Large',
								size: '30px',
							},
						],
					},
				},
			},
		});
		const table = window.mtbCreateTable(
			{
				columns: [{ width: '40%' }, { width: '60%' }],
				columnWidthMode: 'custom',
			},
			Array.from({ length: 2 }, () =>
				Array.from({ length: 2 }, () =>
					window.wp.blocks.createBlock('modular-table-blocks/cell')
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const variables =
		':root {--wp--preset--font-family--bulk-mono:monospace;--wp--preset--font-size--bulk-large:30px;--wp--preset--color--bulk-ink:#204060;}';
	await page.addStyleTag({ content: variables });
	await page
		.frame({ name: 'editor-canvas' })
		?.addStyleTag({ content: variables });
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
});

test('native font presets color appearance and decoration apply together and survive undo redo reload and public rendering', async ({
	page,
}) => {
	const dialog = page.getByRole('dialog');
	const card = dialog.getByRole('region', {
		name: 'Typography',
		exact: true,
	});
	await card.screenshot({
		path: test.info().outputPath('bulk-typography-defaults.png'),
	});
	await dialog
		.getByRole('button', { name: 'All cells', exact: true })
		.click();
	await card.getByRole('button', { name: 'Text color', exact: true }).click();
	await expect(page.getByRole('listbox')).toBeVisible();
	const injectedColor = page.getByRole('option', { name: /Bulk ink/ });
	const colorPreset = (await injectedColor.count()) ? 'bulk-ink' : 'contrast';
	if (colorPreset === 'bulk-ink') {
		await injectedColor.click();
	} else {
		await page
			.getByRole('option', { name: /^(?:Color: )?Contrast$/ })
			.click();
	}
	const chosenColor = await card
		.getByRole('button', { name: 'Text color', exact: true })
		.locator('.component-color-indicator')
		.evaluate((node) => getComputedStyle(node).backgroundColor);
	await page.keyboard.press('Escape');
	await showBulkTypography(page, [
		'Font',
		'Appearance',
		'Decoration',
		'Letter case',
		'Orientation',
	]);
	const usePreset = card.getByRole('button', {
		name: 'Use size preset',
		exact: true,
	});
	if (await usePreset.isVisible()) {
		await usePreset.click();
	}
	await card.getByRole('radio', { name: 'Bulk Large', exact: true }).click();
	const family = card.getByRole('combobox', { name: 'Font', exact: true });
	if (await family.evaluate((node) => node.tagName === 'SELECT')) {
		await family.selectOption({ label: 'Bulk Mono' });
	} else {
		await family.click();
		await page
			.getByRole('option', { name: 'Bulk Mono', exact: true })
			.click();
	}
	await card
		.getByRole('button', { name: 'Appearance', exact: true })
		.or(card.getByRole('combobox', { name: 'Appearance', exact: true }))
		.click();
	await page
		.getByRole('option', { name: 'Semi Bold Italic', exact: true })
		.click();
	await card
		.getByRole('group', { name: 'Decoration', exact: true })
		.getByRole('button', { name: 'Underline', exact: true })
		.click();
	await card
		.getByRole('group', { name: 'Letter case', exact: true })
		.getByRole('button', { name: 'Uppercase', exact: true })
		.click();
	const orientation = card.getByRole('group', {
		name: 'Orientation',
		exact: true,
	});
	await orientation
		.getByRole('button', { name: 'Vertical', exact: true })
		.click();
	await expect(
		dialog.locator('.modular-table-blocks-bulk-preview-cell').first()
	).toHaveCSS('writing-mode', 'vertical-rl');
	await orientation
		.getByRole('button', { name: 'Horizontal', exact: true })
		.click();
	const cell = dialog
		.locator('.modular-table-blocks-bulk-preview-cell')
		.first();
	await expect(cell).toHaveCSS('color', chosenColor);
	await expect(cell).toHaveCSS('font-weight', '600');
	await expect(cell).toHaveCSS('font-style', 'italic');
	await expect(cell).toHaveCSS('font-size', '30px');
	await expect(cell).toHaveCSS('font-family', 'monospace');
	await expect(cell).toHaveCSS('text-transform', 'uppercase');
	await applyBulkSettings(page, 4);
	const after = await page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
	expect(after.attributes).toMatchObject({
		fontFamily: 'bulk-mono',
		fontSize: 'bulk-large',
		textColor: colorPreset,
		style: {
			typography: {
				fontWeight: '600',
				fontStyle: 'italic',
				textDecoration: 'underline',
				textTransform: 'uppercase',
			},
		},
	});
	await dialog
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.attributes
			)
		)
		.toEqual(after.attributes);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Native bulk typography', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.wp.data.select('core/block-editor').getBlocks()[0]
						?.attributes
			)
		)
		.toMatchObject({
			fontFamily: 'bulk-mono',
			fontSize: 'bulk-large',
			textColor: colorPreset,
			style: {
				typography: (after.attributes.style as { typography: object })
					.typography,
			},
			columns: after.attributes.columns,
		});
	await page.goto(`/?p=${id}`);
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	await expect(table).toHaveClass(/has-bulk-mono-font-family/);
	await expect(table).toHaveClass(/has-bulk-large-font-size/);
	await expect(table).toHaveCSS('font-weight', '600');
	await expect(table).toHaveCSS('font-style', 'italic');
	await expect(table).toHaveCSS('text-transform', 'uppercase');
});

test('bulk typography starts with color and size and menu visibility preserves staged values and column widths', async ({
	page,
}) => {
	const dialog = page.getByRole('dialog');
	const card = dialog.getByRole('region', {
		name: 'Typography',
		exact: true,
	});
	await expect(
		card.getByRole('button', { name: 'Text color', exact: true })
	).toBeVisible();
	await expect(card.locator('.components-font-size-picker')).toBeVisible();
	await expect(
		card.getByRole('spinbutton', { name: 'Line height', exact: true })
	).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Column 1', exact: true }).click();
	await expect(
		dialog.getByRole('region', { name: 'Column width', exact: true })
	).toHaveCount(0);
	const before = await page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
	await showBulkTypography(page, [
		'Line height',
		'Letter spacing',
		'Font',
		'Appearance',
		'Decoration',
		'Letter case',
		'Orientation',
	]);
	await card
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('32');
	await card
		.getByRole('spinbutton', { name: 'Line height', exact: true })
		.fill('1.8');
	await card
		.getByRole('spinbutton', { name: 'Letter spacing', exact: true })
		.fill('2');
	await card
		.getByRole('spinbutton', { name: 'Letter spacing', exact: true })
		.press('Tab');
	await card
		.getByRole('button', { name: 'Typography options', exact: true })
		.click();
	const menu = page.getByRole('menu', {
		name: 'Typography options',
		exact: true,
	});
	await menu
		.getByRole('menuitemcheckbox', {
			name: 'Hide and reset Line height',
			exact: true,
		})
		.click();
	await page.keyboard.press('Escape');
	await expect(
		card.getByRole('spinbutton', { name: 'Line height', exact: true })
	).toHaveCount(0);
	await showBulkTypography(page, ['Line height']);
	await expect(
		card.getByRole('spinbutton', { name: 'Line height', exact: true })
	).toHaveValue('1.8');
	expect(
		await page.evaluate(
			() => window.wp.data.select('core/block-editor').getBlocks()[0]
		)
	).toEqual(before);
	await applyBulkSettings(page, 2);
	const after = await page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
	expect(after.attributes.columns).toEqual(before.attributes.columns);
	expect(after.attributes.columnWidthMode).toBe('custom');
	for (const cell of after.innerBlocks) {
		if (cell.attributes.column === 0) {
			expect(cell.attributes.style).toMatchObject({
				typography: {
					fontSize: '32px',
					lineHeight: '1.8',
					letterSpacing: '2px',
				},
			});
		}
	}
	await dialog.screenshot({
		path: test.info().outputPath('native-bulk-typography.png'),
	});
	await resetBulkPanel(page, 'Typography');
	await expect(
		card.getByRole('spinbutton', { name: 'Line height', exact: true })
	).toHaveCount(0);
	await applyBulkSettings(page, 2);
	await dialog
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect
		.poll(() =>
			page.evaluate(
				() => window.wp.data.select('core/block-editor').getBlocks()[0]
			)
		)
		.toEqual(after);
});
