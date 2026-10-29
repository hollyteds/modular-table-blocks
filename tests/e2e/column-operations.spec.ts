import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';
import type { TestBlock } from './browser';

const tree = (page: Page) =>
	page.evaluate(() => window.wp.data.select('core/block-editor').getBlocks());
const selected = (page: Page) =>
	page.evaluate(() =>
		window.wp.data.select('core/block-editor').getSelectedBlockClientId()
	);
const serialized = (page: Page) =>
	page.evaluate(() =>
		window.wp.blocks.serialize(
			window.wp.data.select('core/block-editor').getBlocks()
		)
	);
async function selectCell(page: Page, row = 0, column = 0) {
	await page.evaluate(
		({ r, c }) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const cell = table.innerBlocks.find(
				(block) =>
					block.attributes.row === r && block.attributes.column === c
			)!;
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(cell.clientId);
		},
		{ r: row, c: column }
	);
}
async function selectTable(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
}
async function menu(page: Page, label = 'Table structure') {
	const toggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: label, exact: true });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
	}
	return page.getByRole('menu', { name: label, exact: true });
}
async function action(page: Page, name: string) {
	const popup = await menu(
		page,
		name.startsWith('Move ') ? 'Move rows and columns' : 'Table structure'
	);
	await popup.getByRole('menuitem', { name, exact: true }).click();
}
const ids = (blocks: TestBlock[]): string[] =>
	blocks.flatMap((block) => [block.clientId, ...ids(block.innerBlocks)]);

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (label: string, header = false) =>
			createBlock(
				'modular-table-blocks/cell',
				{
					tag: header ? 'th' : 'td',
					scope: header ? 'col' : '',
					...(label === 'B'
						? {
								styleTokens: {
									cellPaddingTop: '9px',
									cellBackgroundColor: '#ffeecc',
								},
							}
						: {}),
				},
				label === 'B'
					? [
							createBlock('core/paragraph', {
								content:
									'<strong>B</strong> <a href="https://example.test/">Link</a>',
							}),
							createBlock('core/list', {}, [
								createBlock('core/list-item', {
									content: 'Nested list',
								}),
							]),
						]
					: [
							createBlock('modular-table-blocks/cell-text', {
								content: label,
							}),
						]
			);
		const table = window.mtbCreateTable(
			{
				columns: [
					{ width: '120px' },
					{ width: '180px' },
					{ width: '240px' },
				],
				headerRows: 1,
			},
			[
				[cell('A', true), cell('B', true), cell('C', true)],
				[cell('D'), cell('E'), cell('F')],
			]
		);
		const other = window.mtbCreateTable({ columns: [{ width: '360px' }] }, [
			[cell('Other')],
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([table, other]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[1].clientId);
	});
});

test('table append controls and cell structure and movement menus stay separate and work with the keyboard', async ({
	page,
}) => {
	await selectTable(page);
	await expect(
		page.getByRole('button', { name: 'Move rows and columns', exact: true })
	).toHaveCount(0);
	let popup = await menu(page);
	await expect(popup.getByRole('menuitem')).toHaveCount(2);
	await expect(
		popup.getByRole('menuitem', { name: 'Add row at end', exact: true })
	).toBeVisible();
	await popup
		.getByRole('menuitem', { name: 'Add column at end', exact: true })
		.click();
	expect((await tree(page))[0].attributes.columns).toHaveLength(4);
	const added = (await tree(page))[0].innerBlocks.filter(
		(cell) => cell.attributes.column === 3
	);
	expect(added).toHaveLength(2);
	for (const cell of added) {
		expect(cell.innerBlocks).toHaveLength(1);
		expect(cell.innerBlocks[0].name).toBe('modular-table-blocks/cell-text');
		expect(cell.innerBlocks[0].attributes.content).toBe('');
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect
		.poll(
			async () =>
				((await tree(page))[0].attributes.columns as unknown[]).length
		)
		.toBe(3);
	await selectCell(page);
	popup = await menu(page);
	for (const name of [
		'Add row at end',
		'Add column at end',
		'Move row up',
		'Move row down',
		'Move column left',
		'Move column right',
	]) {
		await expect(
			popup.getByRole('menuitem', { name, exact: true })
		).toHaveCount(0);
	}
	await expect(
		popup.getByRole('menuitem', { name: 'Duplicate column', exact: true })
	).toBeEnabled();
	await page.keyboard.press('Escape');
	const toggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Move rows and columns', exact: true });
	await toggle.focus();
	await toggle.press('Enter');
	const movement = page.getByRole('menu', {
		name: 'Move rows and columns',
		exact: true,
	});
	await expect(movement.getByRole('menuitem')).toHaveCount(4);
	for (const name of ['Move row up', 'Move column left']) {
		await expect(
			movement.getByRole('menuitem', { name, exact: true })
		).toBeDisabled();
	}
	for (const name of ['Move row down', 'Move column right']) {
		await expect(
			movement.getByRole('menuitem', { name, exact: true })
		).toBeEnabled();
	}
	await page.screenshot({
		path: test.info().outputPath('movement-menu.png'),
		fullPage: true,
		animations: 'disabled',
	});
	await page.keyboard.press('Escape');
	await expect(toggle).toBeFocused();
});

for (const author of [false, true]) {
	test(`column duplication and movement preserve widths nested content settings and undo through ${author ? 'author' : 'administrator'} save`, async ({
		page,
		context,
	}) => {
		if (author) {
			await openAuthorEditor(page, context);
		}
		await selectCell(page, 0, 1);
		const before = await tree(page);
		const source = before[0].innerBlocks.find(
			(cell) => cell.attributes.row === 0 && cell.attributes.column === 1
		)!;
		const other = await page.evaluate(() =>
			window.wp.blocks.serialize([
				window.wp.data.select('core/block-editor').getBlocks()[1],
			])
		);
		await action(page, 'Duplicate column');
		let table = (await tree(page))[0];
		expect(table.attributes.columns).toEqual([
			{ width: '120px' },
			{ width: '180px' },
			{ width: '180px' },
			{ width: '240px' },
		]);
		const copy = table.innerBlocks.find(
			(cell) => cell.attributes.row === 0 && cell.attributes.column === 2
		)!;
		expect(copy.attributes).toEqual({ ...source.attributes, column: 2 });
		expect(copy.innerBlocks.map((block) => block.name)).toEqual([
			'core/paragraph',
			'core/list',
		]);
		const oldIds = new Set(ids(before[0].innerBlocks));
		for (const id of ids([copy])) {
			expect(id).toBeTruthy();
			expect(oldIds.has(id)).toBe(false);
		}
		const allIds = ids(table.innerBlocks);
		expect(new Set(allIds).size).toBe(allIds.length);
		const copyHtml = await page.evaluate((id) => {
			const cell = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.find((block) => block.clientId === id)!;
			return window.wp.blocks.serialize(cell.innerBlocks);
		}, copy.clientId);
		const sourceHtml = await page.evaluate((id) => {
			const cell = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.find((block) => block.clientId === id)!;
			return window.wp.blocks.serialize(cell.innerBlocks);
		}, source.clientId);
		expect(copyHtml).toBe(sourceHtml);
		expect(await selected(page)).toBe(source.clientId);
		const afterCopy = await serialized(page);
		await action(page, 'Move column left');
		table = (await tree(page))[0];
		expect(table.attributes.columns).toEqual([
			{ width: '180px' },
			{ width: '120px' },
			{ width: '180px' },
			{ width: '240px' },
		]);
		expect(
			table.innerBlocks.find((cell) => cell.clientId === source.clientId)!
				.attributes.column
		).toBe(0);
		expect(await selected(page)).toBe(source.clientId);
		const afterMove = await serialized(page);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		await expect.poll(() => serialized(page)).toBe(afterCopy);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').redo()
		);
		await expect.poll(() => serialized(page)).toBe(afterMove);
		await action(page, 'Move column right');
		expect(await serialized(page)).toBe(afterCopy);
		expect(
			await page.evaluate(() =>
				window.wp.blocks.serialize([
					window.wp.data.select('core/block-editor').getBlocks()[1],
				])
			)
		).toBe(other);
		await page.evaluate(() =>
			window.wp.data
				.dispatch('core/editor')
				.editPost({ title: 'Column editing', status: 'publish' })
		);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect(
			page
				.frameLocator('iframe[name="editor-canvas"]')
				.locator('.modular-table-blocks-editor')
				.first()
				.locator('.modular-table-blocks-editor__cell')
		).toHaveCount(8);
		expect(await serialized(page)).toBe(afterCopy);
		expect(
			await page.evaluate(() => {
				const valid = (
					blocks: ReturnType<typeof window.wp.blocks.createBlock>[]
				): boolean =>
					blocks.every(
						(block) => block.isValid && valid(block.innerBlocks)
					);
				return valid(
					window.wp.data.select('core/block-editor').getBlocks()
				);
			})
		).toBe(true);
		await page.goto(`/?p=${id}`);
		const front = page
			.locator('table.wp-block-modular-table-blocks-table')
			.first();
		await expect(front.locator('th')).toHaveCount(4);
		await expect(front.locator('td')).toHaveCount(4);
		await expect(front.locator('strong')).toHaveCount(2);
		await expect(front.locator('ul')).toHaveCount(2);
		expect(
			await front
				.locator('col')
				.evaluateAll((cols) =>
					cols.map((col) => col.getAttribute('style'))
				)
		).toEqual([
			'--mtb-column-width:120px',
			'--mtb-column-width:180px',
			'--mtb-column-width:180px',
			'--mtb-column-width:240px',
		]);
		await expect(front.locator('div')).toHaveCount(0);
	});
}

test('horizontal merges disable crossing column edits while vertical merges move and duplicate intact', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cells = Array.from({ length: 12 }, (_, i) =>
			createBlock('modular-table-blocks/cell', {}, [
				createBlock('modular-table-blocks/cell-text', {
					content: String.fromCharCode(65 + i),
				}),
			])
		);
		const table = window.mtbCreateTable(
			{
				columns: [
					{ width: '120px' },
					{ width: '180px' },
					{ width: '240px' },
					{ width: '300px' },
				],
				headerRows: 1,
			},
			[cells.slice(0, 4), cells.slice(4, 8), cells.slice(8, 12)]
		);
		table.innerBlocks = window.mtbMergeCells(table, 0, 0, 1, 2);
		table.innerBlocks = window.mtbMergeCells(table, 1, 2, 2, 1);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
	});
	await selectCell(page);
	let popup = await menu(page);
	await expect(
		popup.getByRole('menuitem', { name: 'Duplicate column', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(
		page.getByRole('button', { name: 'Move rows and columns', exact: true })
	).toBeDisabled();
	const settings = page.getByRole('button', {
		name: 'Settings',
		exact: true,
	});
	if ((await settings.getAttribute('aria-pressed')) !== 'true') {
		await settings.click();
	}
	await page.getByRole('tab', { name: 'Block', exact: true }).click();
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'Split cells spanning these columns before moving or duplicating a column.',
				{ exact: true }
			)
	).toBeVisible();
	await selectCell(page, 0, 3);
	await action(page, 'Move column left');
	let table = (await tree(page))[0];
	const vertical = table.innerBlocks.find(
		(cell) => cell.attributes.row === 1 && cell.attributes.column === 3
	)!;
	expect(vertical.attributes.rowSpan).toBe(2);
	expect(vertical.innerBlocks[0].attributes.content).toBe('G');
	await selectCell(page, 0, 2);
	popup = await menu(page, 'Move rows and columns');
	await expect(
		popup.getByRole('menuitem', { name: 'Move column left', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await selectCell(page, 1, 3);
	popup = await menu(page);
	await expect(
		popup.getByRole('menuitem', { name: 'Duplicate column', exact: true })
	).toBeEnabled();
	await popup
		.getByRole('menuitem', { name: 'Duplicate column', exact: true })
		.click();
	table = (await tree(page))[0];
	expect(table.attributes.columns).toHaveLength(5);
	const copy = table.innerBlocks.find(
		(cell) => cell.attributes.row === 1 && cell.attributes.column === 4
	)!;
	expect(copy.attributes.rowSpan).toBe(2);
	expect(copy.innerBlocks[0].attributes.content).toBe('G');
	expect(copy.clientId).not.toBe(vertical.clientId);
	expect(
		table.innerBlocks.some(
			(cell) => cell.attributes.row === 2 && cell.attributes.column === 4
		)
	).toBe(false);
	expect(table.innerBlocks[0].attributes.colSpan).toBe(2);
	await page.setViewportSize({ width: 375, height: 900 });
	await selectCell(page, 1, 3);
	await menu(page, 'Move rows and columns');
	await expect(
		page.getByRole('menuitem', { name: 'Move column right', exact: true })
	).toBeEnabled();
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 1280, height: 900 });
	if ((await settings.getAttribute('aria-pressed')) !== 'true') {
		await settings.click();
	}
});
