import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';

const transparent = 'rgba(0, 0, 0, 0)';
const header = 'rgb(18, 52, 86)';
const stripe = 'rgb(171, 205, 239)';
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
const source = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
async function colors(cells: Locator, expected: string[]) {
	await expect
		.poll(() =>
			cells.evaluateAll((nodes) =>
				nodes.map((node) => getComputedStyle(node).backgroundColor)
			)
		)
		.toEqual(expected);
}
async function update(page: Page, attributes: Record<string, unknown>) {
	await page.evaluate((next) => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, next);
	}, attributes);
}
async function fixture(page: Page) {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (attributes = {}) =>
			createBlock('modular-table-blocks/cell', attributes, [
				createBlock('modular-table-blocks/cell-text', {
					content: 'Text',
				}),
			]);
		const table = window.mtbCreateTable(
			{
				columns: [{ width: '30%' }, { width: '30%' }, { width: '40%' }],
				columnWidthMode: 'equal',
				headerRows: 1,
				stripeMode: 'rows',
				style: { color: { background: '#ffeedd' } },
				styleTokens: {
					headerBackgroundColor: '#123456',
					stripeBackgroundColor: '#abcdef',
				},
			},
			[
				[cell({ colSpan: 3 })],
				[cell({ rowSpan: 2 }), cell({ colSpan: 2 })],
				[
					cell({
						styleTokens: { cellBackgroundColor: 'transparent' },
					}),
					cell(),
				],
				[cell({ tag: 'th' }), cell(), cell()],
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
}

test('background controls use theme palettes, preserve hidden stripe colors and clear without initializing cells', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const before = (await source(page)).innerBlocks;
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await expect(
		page.getByRole('group', { name: 'Cell background rules', exact: true })
	).toBeVisible();
	const group = page.getByRole('radiogroup', {
		name: 'Data cell stripes (TD)',
		exact: true,
	});
	await expect(
		group.getByRole('radio', { name: 'Rows', exact: true })
	).toBeChecked();
	await group.getByRole('radio', { name: 'None', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Stripe background', exact: true })
	).toHaveCount(0);
	expect((await source(page)).attributes.styleTokens).toMatchObject({
		stripeBackgroundColor: '#abcdef',
	});
	await group.getByRole('radio', { name: 'Columns', exact: true }).click();
	const palette = page.getByRole('button', {
		name: 'Stripe background',
		exact: true,
	});
	const colorPanel = page.locator('.components-tools-panel').filter({
		has: page.getByRole('group', {
			name: 'Cell background rules',
			exact: true,
		}),
	});
	await expect(
		colorPanel.getByRole('group', {
			name: 'Cell background rules',
			exact: true,
		})
	).toBeVisible();
	await expect(
		colorPanel.getByRole('button', {
			name: /^(?:Color Background styles|Color)$/,
			exact: true,
		})
	).toBeVisible();
	const colorItem = page
		.locator('.modular-table-blocks-color-control')
		.filter({ has: palette });
	for (const edge of ['top', 'right', 'bottom', 'left']) {
		await expect(colorItem).toHaveCSS(`border-${edge}-width`, '1px');
		await expect(colorItem).toHaveCSS(`border-${edge}-style`, 'solid');
	}
	await palette.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await expect
		.poll(async () => (await source(page)).attributes.styleTokens)
		.toMatchObject({
			stripeBackgroundColor: 'var(--wp--preset--color--contrast)',
		});
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	await page.keyboard.press('Escape');
	expect((await source(page)).attributes.styleTokens).toEqual({
		headerBackgroundColor: '#123456',
	});
	expect((await source(page)).innerBlocks).toEqual(before);
	await page.screenshot({
		path: test.info().outputPath('background-rules.png'),
		animations: 'disabled',
	});
});

test('native color reset clears only colors and rules while preserving current dimensions typography and cell overrides', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const cells = (await source(page)).innerBlocks;
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await expect(
		page.getByRole('group', { name: 'Cell background rules', exact: true })
	).toBeVisible();
	// Update after panel registration to catch callbacks retained by older WP versions.
	await update(page, {
		styleTokens: {
			headerBackgroundColor: '#112233',
			stripeBackgroundColor: '#aabbcc',
			tableWidth: '85%',
			borderSpacingHorizontal: '12px',
			borderWidth: '2px',
		},
		style: {
			color: { background: '#ffeedd', text: '#112233' },
			typography: { fontSize: '21px' },
		},
		borderCollapse: 'separate',
	});
	const attributes = (await source(page)).attributes;
	await page
		.locator('.components-tools-panel')
		.filter({
			has: page.getByRole('group', {
				name: 'Cell background rules',
				exact: true,
			}),
		})
		.getByRole('button', { name: /^(Color|Background) options$/ })
		.click();
	await page
		.getByRole('menuitem', {
			name: /^(Reset )?Cell background rules(?: Reset)?$/,
		})
		.click();
	await expect
		.poll(async () => (await source(page)).attributes.styleTokens)
		.toEqual({
			tableWidth: '85%',
			borderSpacingHorizontal: '12px',
			borderWidth: '2px',
		});
	expect((await source(page)).attributes.style).toEqual(attributes.style);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(async () => (await source(page)).attributes)
		.toEqual(attributes);
	await page
		.locator('.components-tools-panel')
		.filter({
			has: page.getByRole('group', {
				name: 'Cell background rules',
				exact: true,
			}),
		})
		.getByRole('button', { name: /^(Color|Background) options$/ })
		.click();
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	await expect
		.poll(async () => (await source(page)).attributes.styleTokens)
		.toEqual({
			tableWidth: '85%',
			borderSpacingHorizontal: '12px',
			borderWidth: '2px',
		});
	const result = (await source(page)).attributes;
	expect(result.stripeMode).toBeUndefined();
	const style = result.style as {
		color?: { background?: string; text?: string };
		typography?: unknown;
	};
	expect(style?.color?.background).toBeUndefined();
	const backgroundGroup = await page.evaluate(
		() => window.modularTableBlocksSettings?.backgroundInspectorGroup
	);
	expect(style?.color?.text).toBe(
		backgroundGroup === 'background' ? '#112233' : undefined
	);
	expect(style?.typography).toEqual({ fontSize: '21px' });
	expect(result.borderCollapse).toBe('separate');
	expect((await source(page)).innerBlocks).toEqual(cells);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(async () => (await source(page)).attributes)
		.toEqual(attributes);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor')
	).toBeVisible();
	expect((await source(page)).attributes).toEqual(attributes);
	expect(
		await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.isValid
		)
	).toBe(true);
});

for (const author of [false, true]) {
	test(`logical row and column backgrounds match merged editor preview and public HTML after ${author ? 'author' : 'administrator'} reload`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await fixture(page);
		if (author) {
			await openAuthorEditor(page, context);
		}
		const cells = canvas(page).locator(
			'.modular-table-blocks-editor__cell'
		);
		const expected = [
			header,
			transparent,
			transparent,
			transparent,
			stripe,
			header,
			transparent,
			transparent,
		];
		await colors(cells, expected);
		await expect(
			canvas(page).locator('.modular-table-blocks-editor')
		).toHaveCSS('background-color', 'rgb(255, 238, 221)');
		await page.evaluate(() =>
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.clientId
				)
		);
		await page
			.getByRole('button', { name: 'Bulk edit cells', exact: true })
			.click();
		await colors(
			page
				.getByRole('dialog')
				.locator('.modular-table-blocks-bulk-preview-cell'),
			expected
		);
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		await update(page, { stripeMode: 'columns' });
		const columns = [
			header,
			transparent,
			stripe,
			transparent,
			transparent,
			header,
			stripe,
			transparent,
		];
		await colors(cells, columns);
		const serialized = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		await page.evaluate(() =>
			window.wp.data
				.dispatch('core/editor')
				.editPost({ title: 'Background rules', status: 'publish' })
		);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect(cells).toHaveCount(8);
		await colors(cells, columns);
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(serialized);
		await expect(
			page.getByText('This block contains unexpected or invalid content.')
		).toHaveCount(0);
		await page.goto(`/?p=${id}`);
		const table = page.locator('table.wp-block-modular-table-blocks-table');
		await colors(
			table.locator('.wp-block-modular-table-blocks-cell'),
			columns
		);
		await expect(table).toHaveCSS('background-color', 'rgb(255, 238, 221)');
		await expect(table.locator('thead > tr > th[colspan="3"]')).toHaveCount(
			1
		);
		await expect(table.locator('td[style]')).toHaveCount(1);
		await page.setViewportSize({ width: 375, height: 850 });
		await colors(
			table.locator('.wp-block-modular-table-blocks-cell'),
			columns
		);
	});
}

test('bulk uniform background covers rules, remains open after apply and clearing restores the pattern', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	await expect(
		modal.getByRole('region', { name: 'Cell background', exact: true })
	).toBeVisible();
	await modal
		.getByRole('button', { name: 'Cell background', exact: true })
		.last()
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	const selectedColor = await modal
		.getByRole('region', { name: 'Cell background', exact: true })
		.locator(
			'.modular-table-blocks-color-control .component-color-indicator'
		)
		.evaluate((node) => getComputedStyle(node).backgroundColor);
	await page.keyboard.press('Escape');
	await colors(
		modal.locator('.modular-table-blocks-bulk-preview-cell'),
		Array(8).fill(selectedColor)
	);
	await modal
		.getByRole('button', { name: 'Apply to 8 cells', exact: true })
		.click();
	await expect(modal).toBeVisible();
	await colors(
		modal.locator('.modular-table-blocks-bulk-preview-cell'),
		Array(8).fill(selectedColor)
	);
	const after = await source(page);
	expect(after.attributes.styleTokens).toMatchObject({
		headerBackgroundColor: '#123456',
		stripeBackgroundColor: '#abcdef',
		cellBackgroundColor: 'var(--wp--preset--color--contrast)',
	});
	expect(
		after.innerBlocks.filter(
			(cell) =>
				(cell.attributes.styleTokens as Record<string, string>)
					?.cellBackgroundColor !== undefined
		)
	).toHaveLength(4);
	await modal
		.getByRole('button', { name: 'Cell background', exact: true })
		.last()
		.click();
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	await page.keyboard.press('Escape');
	await colors(modal.locator('.modular-table-blocks-bulk-preview-cell'), [
		header,
		transparent,
		transparent,
		stripe,
		stripe,
		header,
		transparent,
		transparent,
	]);
	await modal
		.getByRole('button', { name: 'Apply to 8 cells', exact: true })
		.click();
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await colors(canvas(page).locator('.modular-table-blocks-editor__cell'), [
		header,
		transparent,
		transparent,
		stripe,
		stripe,
		header,
		transparent,
		transparent,
	]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await colors(
		canvas(page).locator('.modular-table-blocks-editor__cell'),
		Array(8).fill(selectedColor)
	);
});
