import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';

const attributes = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0].attributes
	);
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
async function panel(page: Page) {
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await expect(
		page.getByRole('group', { name: 'Column widths', exact: true })
	).toBeVisible();
}
const mode = (page: Page, name: string) =>
	page
		.getByRole('radiogroup', { name: 'Column width mode', exact: true })
		.getByRole('radio', { name, exact: true });
async function equalWidths(cells: Locator) {
	await expect
		.poll(async () => {
			const widths = await cells.evaluateAll((nodes) =>
				nodes.map((node) => node.getBoundingClientRect().width)
			);
			return Math.max(...widths) - Math.min(...widths);
		})
		.toBeLessThan(1);
}
async function publish(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Column width modes', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	return page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
}
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{ columns: [{}, {}, {}], caption: 'Width modes' },
			Array.from({ length: 3 }, () =>
				[
					'ID',
					'Name',
					'An explanation with many words that needs more space',
				].map((content) =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('modular-table-blocks/cell-text', {
							content,
						}),
					])
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
});

test('equal is the default and compact width controls preserve custom percentages through mode changes and undo', async ({
	page,
}) => {
	await panel(page);
	const settings = page.locator('.modular-table-blocks-table-settings');
	const order = await settings
		.locator(
			':scope > button.modular-table-blocks-table-settings__bulk, :scope > .components-base-control input[type="checkbox"], :scope > .modular-table-blocks-table-settings__section'
		)
		.evaluateAll((nodes) =>
			nodes.map((node) => {
				if (
					node.classList.contains(
						'modular-table-blocks-table-settings__section'
					)
				) {
					return node.getAttribute('aria-label');
				}
				if (node.matches('button')) {
					return node.textContent;
				}
				return document.querySelector(`label[for="${node.id}"]`)
					?.textContent;
			})
		);
	expect(order).toEqual([
		'Use first row as headers (TH)',
		'Horizontal scrolling',
		'Bulk edit cells',
		'Column widths',
		'Cell spacing',
		'Table width',
		'Caption',
	]);
	await expect(
		settings.getByRole('spinbutton', { name: 'Table width', exact: true })
	).toBeVisible();
	await expect(
		settings.getByRole('button', {
			name: 'Reset Table width to inherit',
			exact: true,
		})
	).toHaveCount(0);
	const bulk = settings.getByRole('button', {
		name: 'Bulk edit cells',
		exact: true,
	});
	const widthDifference = await bulk.evaluate((node) =>
		Math.abs(
			node.getBoundingClientRect().width -
				(node.parentElement!.clientWidth -
					parseFloat(
						getComputedStyle(node.parentElement!).paddingLeft
					) -
					parseFloat(
						getComputedStyle(node.parentElement!).paddingRight
					))
		)
	);
	expect(widthDifference).toBeLessThan(1);
	const dividers = settings.locator('hr');
	await expect(dividers).toHaveCount(4);
	for (const divider of await dividers.all()) {
		await expect(divider).toHaveCSS('border-top-width', '1px');
	}

	await expect(mode(page, 'Equal width')).toBeChecked();
	await expect(
		page.getByRole('spinbutton', { name: /^Column \d+ width$/ })
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: /Reset column.*automatic width/ })
	).toHaveCount(0);
	const cells = canvas(page).locator(
		'.modular-table-blocks-editor__cell[data-mtb-row="1"]'
	);
	await equalWidths(cells);
	expect((await attributes(page)).columns).toEqual([{}, {}, {}]);
	await mode(page, 'Custom widths').click();
	for (const [index, value] of ['20', '30', '50'].entries()) {
		const group = page.getByRole('group', {
			name: `Column ${index + 1} width`,
			exact: true,
		});
		await expect(
			group.getByRole('combobox', { name: 'Select unit', exact: true })
		).toHaveValue('%');
		await group.getByRole('spinbutton').fill(value);
		await group.getByRole('spinbutton').press('Tab');
	}
	const widths = [{ width: '20%' }, { width: '30%' }, { width: '50%' }];
	expect((await attributes(page)).columns).toEqual(widths);
	await mode(page, 'Automatic width').click();
	await expect(
		page.getByRole('spinbutton', { name: /^Column \d+ width$/ })
	).toHaveCount(0);
	await expect
		.poll(async () => {
			const w = await cells.evaluateAll((nodes) =>
				nodes.map((node) => node.getBoundingClientRect().width)
			);
			return w[2] - w[0];
		})
		.toBeGreaterThan(20);
	expect((await attributes(page)).columns).toEqual(widths);
	await mode(page, 'Equal width').click();
	await equalWidths(cells);
	await mode(page, 'Custom widths').click();
	await expect(
		page.getByRole('spinbutton', { name: 'Column 1 width', exact: true })
	).toHaveValue('20');
	await page.screenshot({
		path: test.info().outputPath('custom-column-widths.png'),
		animations: 'disabled',
	});
	await mode(page, 'Automatic width').click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(mode(page, 'Custom widths')).toBeChecked();
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(mode(page, 'Automatic width')).toBeChecked();
	expect((await attributes(page)).columns).toEqual(widths);
});

for (const author of [false, true]) {
	test(`all width modes survive ${author ? 'author' : 'administrator'} save and ignore retained custom widths outside custom mode`, async ({
		page,
		context,
	}) => {
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data.dispatch('core/block-editor').resetBlocks(
				['equal', 'auto', 'custom'].map((widthMode) =>
					window.wp.blocks.createBlock(
						table.name,
						{
							...table.attributes,
							columnWidthMode: widthMode,
							caption: widthMode,
							columns: [
								{ width: '20%' },
								{ width: '30%' },
								{ width: '50%' },
							],
						},
						table.innerBlocks.map((cell) =>
							window.wp.blocks.cloneBlock(cell)
						)
					)
				)
			);
		});
		if (author) {
			await openAuthorEditor(page, context);
		}
		const source = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		const id = await publish(page);
		await page.reload();
		await expect(
			canvas(page).locator('.modular-table-blocks-editor')
		).toHaveCount(3);
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(source);
		await page.goto(`/?p=${id}`);
		for (const [index, widthMode] of [
			'equal',
			'auto',
			'custom',
		].entries()) {
			const table = page
				.locator('table.wp-block-modular-table-blocks-table')
				.nth(index);
			await expect(table).toHaveAttribute(
				'data-mtb-column-width-mode',
				widthMode
			);
			await expect(table).toHaveCSS(
				'table-layout',
				widthMode === 'equal' ? 'fixed' : 'auto'
			);
			const styles = await table
				.locator('col')
				.evaluateAll((cols) =>
					cols.map((col) => col.getAttribute('style'))
				);
			expect(styles).toEqual(
				widthMode === 'custom'
					? [
							'--mtb-column-width:20%',
							'--mtb-column-width:30%',
							'--mtb-column-width:50%',
						]
					: [null, null, null]
			);
			if (widthMode === 'equal') {
				await equalWidths(table.locator('tr').nth(1).locator('td'));
			}
			if (widthMode === 'auto') {
				const w = await table
					.locator('tr')
					.nth(1)
					.locator('td')
					.evaluateAll((nodes) =>
						nodes.map((node) => node.getBoundingClientRect().width)
					);
				expect(w[2] - w[0]).toBeGreaterThan(20);
			}
		}
	});
}

test('equal logical columns remain equal with merged cells and separated borders in editor preview and public output', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 0, 1, 2),
				false
			);
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				borderCollapse: 'separate',
				styleTokens: {
					borderSpacingHorizontal: '12px',
					borderSpacingVertical: '6px',
				},
			});
	});
	await equalWidths(
		canvas(page).locator(
			'.modular-table-blocks-editor__cell[data-mtb-row="1"]'
		)
	);
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const modal = page.getByRole('dialog');
	const preview = modal.locator('.modular-table-blocks-bulk-preview-table');
	await expect(preview).toHaveAttribute(
		'data-mtb-column-width-mode',
		'equal'
	);
	await equalWidths(
		preview
			.locator('tbody > tr')
			.nth(1)
			.locator('.modular-table-blocks-bulk-preview-cell')
	);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	for (const width of [1280, 375]) {
		await page.setViewportSize({ width, height: 900 });
		const table = page.locator('table.wp-block-modular-table-blocks-table');
		const cells = table.locator('tr').nth(1).locator('td');
		await equalWidths(cells);
		const cellWidth = (await cells.first().boundingBox())!.width;
		expect(
			Math.abs(
				(await table.locator('[colspan="2"]').boundingBox())!.width -
					(2 * cellWidth + 12)
			)
		).toBeLessThan(2);
		expect(
			(await table.boundingBox())!.width -
				(await table.locator('..').boundingBox())!.width
		).toBeLessThanOrEqual(1);
		expect(
			await page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth
			)
		).toBeLessThanOrEqual(1);
	}
});

test('bulk selection leaves the table column widths and mode unchanged', async ({
	page,
}) => {
	const before = await attributes(page);
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await expect(
		modal.getByRole('region', { name: 'Column width', exact: true })
	).toHaveCount(0);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await attributes(page)).toEqual(before);
});
