import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = createBlock(
			'modular-table-blocks/table',
			{ columns: [{}, {}, {}], caption: 'M2 table' },
			Array.from({ length: 3 }, (_row, r) =>
				createBlock(
					'modular-table-blocks/row',
					{},
					Array.from({ length: 3 }, (_cell, c) =>
						createBlock('modular-table-blocks/cell', {}, [
							createBlock('core/paragraph', {
								content: String.fromCharCode(65 + r * 3 + c),
							}),
						])
					)
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[0].innerBlocks[0].clientId);
	});
});
const tree = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
const allText = (page: Page) =>
	page.evaluate(() =>
		window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.flatMap((r) =>
				r.innerBlocks.flatMap((c) =>
					c.innerBlocks.map((b) => String(b.attributes.content ?? ''))
				)
			)
	);
async function select(page: Page, row: number, cell: number) {
	await page.evaluate(
		({ r, c }) =>
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.innerBlocks[r].innerBlocks[c].clientId
				),
		{ r: row, c: cell }
	);
}
async function menu(page: Page) {
	const toggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Table structure', exact: true });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
	}
	return page.getByRole('menu', { name: 'Table structure', exact: true });
}
async function action(page: Page, name: string) {
	await (
		await menu(page)
	)
		.getByRole('menuitem', { name, exact: true })
		.click();
}
async function merge(page: Page, rows: string, columns: string) {
	await action(page, 'Merge cells');
	const dialog = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await dialog
		.getByLabel('Rows to merge', { exact: true })
		.selectOption(rows);
	await dialog
		.getByLabel('Columns to merge', { exact: true })
		.selectOption(columns);
	await dialog
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
}
async function save(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'M2 grid', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
}
async function reload(page: Page) {
	await page.reload();
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	await select(page, 0, 0);
}

for (const range of [
	{ rows: '1', columns: '2' },
	{ rows: '2', columns: '1' },
	{ rows: '2', columns: '2' },
]) {
	test(`merged editor borders fill ${range.rows}×${range.columns} tracks beside taller content`, async ({
		page,
	}) => {
		const before = await tree(page);
		const topRightId = before.innerBlocks[0].innerBlocks[2].clientId;
		const bottomRightId =
			before.innerBlocks[Number(range.rows) - 1].innerBlocks[2].clientId;
		const nextColumnId =
			before.innerBlocks[0].innerBlocks[Number(range.columns)].clientId;
		await page.evaluate((id) => {
			window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
				id,
				Array.from({ length: 10 }, () =>
					window.wp.blocks.createBlock('core/paragraph', {
						content: 'Tall neighboring cell',
					})
				),
				false
			);
		}, topRightId);
		await merge(page, range.rows, range.columns);
		const canvas = page.frameLocator('iframe[name="editor-canvas"]');
		const anchorId = (await tree(page)).innerBlocks[0].innerBlocks[0]
			.clientId;
		const anchor = canvas.locator(`[data-block="${anchorId}"]`);
		const topRight = canvas.locator(`[data-block="${topRightId}"]`);
		const bottomRight = canvas.locator(`[data-block="${bottomRightId}"]`);
		const nextColumn = canvas.locator(`[data-block="${nextColumnId}"]`);
		const checkEdges = async () => {
			await expect
				.poll(async () => {
					const a = (await anchor.boundingBox())!;
					const top = (await topRight.boundingBox())!;
					const bottom = (await bottomRight.boundingBox())!;
					const right = (await nextColumn.boundingBox())!;
					return Math.max(
						Math.abs(a.y - top.y),
						Math.abs(a.y + a.height - bottom.y - bottom.height),
						Math.abs(a.x + a.width - right.x)
					);
				})
				.toBeLessThan(2);
		};
		await checkEdges();
		const frame = page
			.frames()
			.find((candidate) => candidate.name() === 'editor-canvas')!;
		await frame.addStyleTag({
			content:
				'.editor-styles-wrapper .wp-block { align-self: start; justify-self: start; height: fit-content; margin-block: 12px; }',
		});
		await checkEdges();
		await page.evaluate(
			(id) =>
				window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
					id,
					[
						window.wp.blocks.createBlock('core/paragraph', {
							content: 'Short',
						}),
					],
					false
				),
			anchorId
		);
		await anchor
			.locator('[contenteditable="true"]')
			.first()
			.fill('短い内容');
		await select(page, 0, 0);
		for (const alignment of ['top', 'middle', 'bottom']) {
			await page
				.getByLabel('Vertical alignment', { exact: true })
				.selectOption(alignment);
			await checkEdges();
		}
		await page.screenshot({
			path: test.info().outputPath('merged-borders.png'),
			fullPage: true,
		});
	});
}

test('rectangular merge and split preserve content, actual grid geometry, undo and saved HTML', async ({
	page,
}) => {
	const before = await tree(page);
	await merge(page, '2', '2');
	let current = await tree(page);
	expect(current.innerBlocks.map((r) => r.innerBlocks.length)).toEqual([
		2, 1, 3,
	]);
	expect(current.innerBlocks[0].innerBlocks[0].attributes).toMatchObject({
		rowSpan: 2,
		colSpan: 2,
	});
	expect(await allText(page)).toEqual([
		'A',
		'B',
		'D',
		'E',
		'C',
		'F',
		'G',
		'H',
		'I',
	]);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const anchor = canvas.locator(
		`[data-block="${current.innerBlocks[0].innerBlocks[0].clientId}"]`
	);
	const last = canvas.locator(
		`[data-block="${current.innerBlocks[1].innerBlocks[0].clientId}"]`
	);
	const a = (await anchor.boundingBox())!;
	const b = (await last.boundingBox())!;
	expect(a.height).toBeGreaterThan(b.height * 1.5);
	expect(Math.abs(a.x + a.width - b.x)).toBeLessThan(2);
	const overview = page.getByRole('button', {
		name: 'Document Overview',
		exact: true,
	});
	await overview.click();
	await page
		.getByRole('treegrid')
		.getByRole('link', { name: /Table Row/ })
		.first()
		.click();
	expect(
		await page.evaluate(() =>
			window.wp.data
				.select('core/block-editor')
				.getSelectedBlockClientId()
		)
	).toBe(current.innerBlocks[0].clientId);
	await expect(
		page
			.getByRole('toolbar', { name: 'Block tools', exact: true })
			.getByRole('button', { name: 'Table structure', exact: true })
	).toBeVisible();
	await overview.click();
	await select(page, 0, 0);
	const paragraph = anchor.locator('[contenteditable="true"]').nth(2);
	await paragraph.click();
	await expect(paragraph).toBeFocused();
	await select(page, 0, 0);
	await page.screenshot({
		path: test.info().outputPath('merged-editor.png'),
		fullPage: true,
	});
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect((await tree(page)).innerBlocks).toEqual(before.innerBlocks);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.rowSpan
	).toBe(2);
	await save(page);
	await reload(page);
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes
	).toMatchObject({ rowSpan: 2, colSpan: 2 });
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	const publicPage = await page.context().newPage();
	await publicPage.goto(`/?p=${id}`);
	await expect(
		publicPage.locator(
			'table > tbody > tr > td[colspan="2"][rowspan="2"] > p'
		)
	).toHaveText(['A', 'B', 'D', 'E']);
	await expect(
		publicPage.locator('table > div, tbody > div, tr > div')
	).toHaveCount(0);
	await publicPage.close();
	await action(page, 'Split cell');
	current = await tree(page);
	expect(current.innerBlocks.map((r) => r.innerBlocks.length)).toEqual([
		3, 3, 3,
	]);
	expect((await allText(page)).filter(Boolean)).toEqual([
		'A',
		'B',
		'D',
		'E',
		'C',
		'F',
		'G',
		'H',
		'I',
	]);
	await save(page);
	await reload(page);
	expect(
		(await tree(page)).innerBlocks.map((r) => r.innerBlocks.length)
	).toEqual([3, 3, 3]);
});

test('row and column edits expand or shrink merged cells and retain their content', async ({
	page,
}) => {
	await merge(page, '2', '2');
	const id = (await tree(page)).innerBlocks[0].innerBlocks[0].clientId;
	await select(page, 2, 0);
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'Split cells spanning these rows before moving or duplicating a row.',
				{ exact: true }
			)
	).toBeVisible();
	await action(page, 'Insert column after');
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.colSpan
	).toBe(3);
	await select(page, 0, 0);
	await action(page, 'Insert row below');
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.rowSpan
	).toBe(3);
	const dropdown = await menu(page);
	await expect(
		dropdown.getByRole('menuitem', { name: 'Duplicate row', exact: true })
	).toBeDisabled();
	await expect(
		dropdown.getByRole('menuitem', { name: 'Move row down', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await action(page, 'Delete column');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.colSpan
	).toBe(2);
	await select(page, 0, 0);
	await action(page, 'Delete row');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	const anchor = (await tree(page)).innerBlocks[0].innerBlocks[0];
	expect(anchor.clientId).toBe(id);
	expect(anchor.attributes.rowSpan).toBe(2);
	expect((await allText(page)).filter(Boolean)).toEqual([
		'A',
		'B',
		'D',
		'E',
		'F',
		'H',
		'I',
	]);
	await save(page);
	await reload(page);
	expect((await allText(page)).filter(Boolean)).toEqual([
		'A',
		'B',
		'D',
		'E',
		'F',
		'H',
		'I',
	]);
});

test('partial ranges, header boundaries and changed merge confirmations are rejected', async ({
	page,
}) => {
	await merge(page, '1', '2');
	await action(page, 'Merge cells');
	const dialog = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await dialog
		.getByLabel('Columns to merge', { exact: true })
		.selectOption('1');
	await expect(
		dialog.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	await dialog
		.getByLabel('Columns to merge', { exact: true })
		.selectOption('3');
	await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[0].innerBlocks[0].innerBlocks[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(block.clientId, { content: 'Edited' });
	});
	await dialog
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.colSpan
	).toBe(2);
	await action(page, 'Split cell');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { headerRows: 1 });
	});
	await action(page, 'Merge cells');
	await dialog.getByLabel('Rows to merge', { exact: true }).selectOption('2');
	await expect(
		dialog.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { headerRows: 0 });
	});
	await merge(page, '2', '1');
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
	await page.getByLabel('Header row', { exact: true }).click();
	await expect(
		page.getByLabel('Header row', { exact: true })
	).not.toBeChecked();
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'Split cells crossing the first row before enabling the header row.',
				{ exact: true }
			)
	).toBeVisible();
});

test('fully covered rows and rich content survive merging and author save/reload', async ({
	page,
	context,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[0].innerBlocks[1];
		window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
			cell.clientId,
			[
				createBlock('core/list', {}, [
					createBlock('core/list-item', {
						content: 'Merged list item',
					}),
				]),
				createBlock('core/image', {
					url: `${window.location.origin}/wp-includes/images/w-logo-blue.png`,
					alt: 'Merged image',
				}),
				createBlock('core/buttons', {}, [
					createBlock('core/button', {
						text: 'Merged button',
						url: 'https://example.com/',
					}),
				]),
			],
			false
		);
	});
	await openAuthorEditor(page, context);
	await select(page, 0, 0);
	await merge(page, '3', '3');
	expect(
		(await tree(page)).innerBlocks.map((r) => r.innerBlocks.length)
	).toEqual([1, 0, 0]);
	await save(page);
	await reload(page);
	expect(
		(await tree(page)).innerBlocks.map((r) => r.innerBlocks.length)
	).toEqual([1, 0, 0]);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	const publicPage = await context.newPage();
	await publicPage.goto(`/?p=${id}`);
	await expect(publicPage.locator('table > tbody > tr')).toHaveCount(3);
	await expect(
		publicPage.locator('td[rowspan="3"][colspan="3"] ul > li')
	).toHaveText('Merged list item');
	await expect(
		publicPage.getByAltText('Merged image', { exact: true })
	).toHaveCount(1);
	await expect(
		publicPage.getByRole('link', { name: 'Merged button', exact: true })
	).toHaveCount(1);
	await publicPage.close();
	await action(page, 'Split cell');
	await save(page);
	await reload(page);
	expect(
		(await tree(page)).innerBlocks.map((r) => r.innerBlocks.length)
	).toEqual([3, 3, 3]);
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].innerBlocks.filter(
			(b) => b.name === 'core/list'
		)
	).toHaveLength(1);
});
