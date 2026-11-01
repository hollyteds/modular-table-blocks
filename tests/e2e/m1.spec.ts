import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';
import { editorCanvas } from './editor-canvas';
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (text: string) =>
			createBlock('modular-table-blocks/cell', {}, [
				createBlock('core/paragraph', { content: text }),
			]);
		const table = window.mtbCreateTable(
			{
				columns: [{ width: '40%' }, { width: '60%' }],
				caption: 'M1 table',
			},
			[
				[cell('A'), cell('B')],
				[cell('C'), cell('D')],
			]
		);
		const other = window.mtbCreateTable({ columns: [{}] }, [
			[cell('Other table')],
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([table, other]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			);
	});
});
async function selectCell(page: Page, row = 0, column = 0) {
	await page.evaluate(
		({ row: targetRow, column: targetColumn }) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					table.innerBlocks.filter(
						(candidate) => candidate.attributes.row === targetRow
					)[targetColumn].clientId
				);
		},
		{ row, column }
	);
}
async function structureMenu(page: Page, label = 'Table structure') {
	const toggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', {
			name: label,
			exact: true,
		});
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
	}
	return page.getByRole('menu', { name: label, exact: true });
}
async function structureAction(page: Page, name: string) {
	const menu = await structureMenu(
		page,
		name.startsWith('Move ') ? 'Move rows and columns' : 'Table structure'
	);
	await menu.getByRole('menuitem', { name, exact: true }).click();
}
for (const role of ['administrator', 'author']) {
	test(`automatic column settings remain operable after repeated editor reloads as ${role}`, async ({
		page,
		context,
	}) => {
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(table.clientId, { columns: [{}, {}] });
			window.wp.data.dispatch('core/editor').editPost({
				title: 'Reload automatic columns',
				status: 'draft',
			});
		});
		if (role === 'author') {
			await openAuthorEditor(page, context);
			await page.evaluate(() => {
				window.wp.data.dispatch('core/editor').editPost({
					title: 'Reload author columns',
					status: 'draft',
				});
			});
		}
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		for (let attempt = 0; attempt < 2; attempt++) {
			await page.reload();
			await page.waitForFunction(
				() =>
					!!window.wp?.blocks?.getBlockType(
						'modular-table-blocks/table'
					)
			);
			await selectCell(page);
			await expect(
				page.getByText(
					'The table grid is inconsistent. Content is preserved; automatic repair is not available.',
					{ exact: true }
				)
			).toHaveCount(0);
			const menu = await structureMenu(page);
			await expect(
				menu.getByRole('menuitem', {
					name: 'Insert row below',
					exact: true,
				})
			).toBeEnabled();
			await page.keyboard.press('Escape');
			expect(await content(page)).toEqual(
				attempt === 0
					? [
							['A', 'B'],
							['C', 'D'],
						]
					: [
							['A', '', 'B'],
							['C', '', 'D'],
						]
			);
			if (attempt === 0) {
				await structureAction(page, 'Insert column after');
				await page.evaluate(() =>
					window.wp.data.dispatch('core/editor').savePost()
				);
			}
		}
	});
}
test('structure actions are available only in the toolbar for tables and cells', async ({
	page,
}) => {
	for (const target of ['table', 'cell']) {
		await page.evaluate((level) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const row = table.innerBlocks[0];
			let selected = table;
			if (level === 'row') {
				selected = row;
			} else if (level === 'cell') {
				selected = row;
			}
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(selected.clientId);
		}, target);
		await expect(
			page.getByRole('button', { name: 'Table structure', exact: true })
		).toHaveCount(1);
		await expect(
			page.getByRole('button', {
				name: /^(Add row at end|Add column at end|Insert row above|Insert row below|Duplicate row|Move row up|Move row down|Delete row|Insert column before|Insert column after|Delete column)$/,
			})
		).toHaveCount(0);
		const menu = await structureMenu(page);
		await expect(
			menu.getByRole('menuitem', { name: 'Add row at end', exact: true })
		).toHaveCount(target === 'table' ? 1 : 0);
		await expect(
			menu.getByRole('menuitem', {
				name: 'Insert row below',
				exact: true,
			})
		).toHaveCount(target === 'table' ? 0 : 1);
		await expect(
			menu.getByRole('menuitem', {
				name: 'Insert column after',
				exact: true,
			})
		).toHaveCount(target === 'cell' ? 1 : 0);
		if (target === 'cell') {
			await page.screenshot({
				path: test.info().outputPath('toolbar-structure.png'),
				fullPage: true,
			});
		}
		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
	}
});
for (const scenario of [
	{ name: 'automatic', columns: [{}, {}], ratio: 0.5 },
	{
		name: 'percentage',
		columns: [{ width: '40%' }, { width: '60%' }],
		ratio: 0.4,
	},
	{
		name: 'fixed',
		columns: [{ width: '240px' }, { width: '360px' }],
		ratio: 0,
	},
]) {
	test(`cell editing keeps ${scenario.name} columns aligned with theme auto margins`, async ({
		page,
	}) => {
		await page.evaluate((columns) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const actions = window.wp.data.dispatch('core/block-editor');
			actions.updateBlockAttributes(table.clientId, {
				columns,
				columnWidthMode: columns.some((column) => 'width' in column)
					? 'custom'
					: 'auto',
			});
			for (const cell of table.innerBlocks) {
				actions.updateBlockAttributes(cell.innerBlocks[0].clientId, {
					content: '',
				});
			}
		}, scenario.columns);
		const canvas = page.frameLocator('iframe[name="editor-canvas"]');
		await page
			.frames()
			.find((frame) => frame.name() === 'editor-canvas')!
			.addStyleTag({
				content:
					'.editor-styles-wrapper .wp-block { margin-left: auto; margin-right: auto; }',
			});
		const cell = canvas
			.locator('.modular-table-blocks-editor__cell')
			.first();
		const paragraph = cell.locator('[contenteditable="true"]').first();
		const sizes = () =>
			cell.evaluate((node) => {
				const style = getComputedStyle(node);
				const child = node.querySelector('[contenteditable="true"]')!;
				return {
					cell: node.getBoundingClientRect().width,
					paragraph: child.getBoundingClientRect().width,
					available:
						node.clientWidth -
						parseFloat(style.paddingLeft) -
						parseFloat(style.paddingRight),
				};
			});
		await paragraph.click();
		const row = canvas
			.locator('.modular-table-blocks-editor__cells')
			.first();
		const rowWidth = (await row.boundingBox())!.width;
		const expected = scenario.ratio ? rowWidth * scenario.ratio : 240;
		await expect
			.poll(async () => Math.abs((await sizes()).cell - expected))
			.toBeLessThan(1);
		const before = await sizes();
		await paragraph.pressSequentially('a');
		for (const value of [
			'a',
			'長い文字列を入力しても列幅を維持します。'.repeat(12),
			'',
		]) {
			await paragraph.fill(value);
			const after = await sizes();
			if (scenario.name === 'automatic') {
				// Automatic columns now follow content; the cell must still
				// fill its track and stay aligned with the next row.
				const nextRowCell = canvas
					.locator(
						`.modular-table-blocks-editor__cell[data-mtb-row="${1}"]`
					)
					.first();
				expect(
					Math.abs(
						after.cell - (await nextRowCell.boundingBox())!.width
					)
				).toBeLessThan(1);
				expect(after.cell).toBeGreaterThanOrEqual(
					Math.min(128, rowWidth / 2)
				);
			} else {
				expect(Math.abs(after.cell - before.cell)).toBeLessThan(1);
			}
			expect(Math.abs(after.paragraph - after.available)).toBeLessThan(1);
		}
	});
}
const tree = (page: Page) =>
	page.evaluate(() => window.wp.data.select('core/block-editor').getBlocks());
const content = (page: Page) =>
	page.evaluate(() =>
		window
			.mtbRows(window.wp.data.select('core/block-editor').getBlocks()[0])
			.map((row) =>
				row.map((cell) =>
					cell.innerBlocks
						.map((b) => String(b.attributes.content ?? ''))
						.join('')
				)
			)
	);
test('row and column operations are atomic, preserve contents and support undo/redo', async ({
	page,
}) => {
	const consoleErrors: string[] = [];
	page.on('console', (message) => {
		if (
			message.type() === 'error' &&
			!message.text().startsWith('Warning: You are importing createRoot')
		) {
			consoleErrors.push(message.text());
		}
	});
	const before = await tree(page);
	await structureAction(page, 'Insert column after');
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['C', '', 'D'],
	]);
	expect((await tree(page))[0].attributes.columns).toEqual([
		{ width: '40%' },
		{ width: '40%' },
		{ width: '60%' },
	]);
	expect((await tree(page))[1]).toEqual(before[1]);
	const canvas = await editorCanvas(page);
	await expect
		.poll(async () => {
			const bounds = await canvas
				.locator('.modular-table-blocks-editor__cell')
				.nth(1)
				.boundingBox();
			return bounds?.width || 0;
		})
		.toBeGreaterThanOrEqual(128);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect(await content(page)).toEqual([
		['A', 'B'],
		['C', 'D'],
	]);
	expect((await tree(page))[0].attributes.columns).toEqual([
		{ width: '40%' },
		{ width: '60%' },
	]);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['C', '', 'D'],
	]);
	await selectCell(page);
	await structureAction(page, 'Duplicate row');
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['A', '', 'B'],
		['C', '', 'D'],
	]);
	const duplicated = await tree(page);
	expect(duplicated[0].innerBlocks[0].clientId).not.toBe(
		duplicated[0].innerBlocks[1].clientId
	);
	expect(
		duplicated[0].innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].innerBlocks[0].clientId
	).not.toBe(
		duplicated[0].innerBlocks.filter(
			(candidate) => candidate.attributes.row === 1
		)[0].innerBlocks[0].clientId
	);
	await selectCell(page, 2, 0);
	await structureAction(page, 'Move row up');
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['C', '', 'D'],
		['A', '', 'B'],
	]);
	await selectCell(page, 1, 0);
	await structureAction(page, 'Insert row below');
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['C', '', 'D'],
		['', '', ''],
		['A', '', 'B'],
	]);
	await selectCell(page, 2, 0);
	await structureAction(page, 'Delete row');
	// Empty newly created rows must not require content-loss confirmation.
	if (
		await page
			.getByRole('dialog', { name: 'Delete content?', exact: true })
			.isVisible()
	) {
		throw new Error(
			'Blank row unexpectedly required content deletion confirmation'
		);
	}
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['C', '', 'D'],
		['A', '', 'B'],
	]);
	await selectCell(page, 1, 0);
	await structureAction(page, 'Delete row');
	await expect(
		page.getByRole('dialog', { name: 'Delete content?', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(await content(page)).toHaveLength(3);
	await structureAction(page, 'Delete row');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['A', '', 'B'],
	]);
	await selectCell(page, 0, 2);
	await structureAction(page, 'Delete column');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	expect(await content(page)).toEqual([
		['A', ''],
		['A', ''],
	]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['A', '', 'B'],
	]);
	await page.screenshot({
		path: test.info().outputPath('m1-editor.png'),
		fullPage: true,
	});
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'M1 structure', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	expect(await content(page)).toEqual([
		['A', '', 'B'],
		['A', '', 'B'],
	]);
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${postId}`);
	await expect(
		page
			.locator('table.wp-block-modular-table-blocks-table')
			.first()
			.locator('tbody > tr')
	).toHaveCount(2);
	await expect(page.getByText('Other table', { exact: true })).toBeVisible();
	expect(consoleErrors).toEqual([]);
});
test('header, alignment, widths and keyboard scrolling survive save and reload', async ({
	page,
}) => {
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await page
		.locator('.modular-table-blocks-alignment-matrix')
		.getByRole('gridcell')
		.nth(8)
		.click();
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page
		.getByLabel('Use first row as headers (TH)', { exact: true })
		.check();
	await page.getByLabel('Horizontal scrolling', { exact: true }).check();
	await page
		.getByRole('group', { name: 'Column 1 width', exact: true })
		.getByRole('combobox', { name: 'Select unit', exact: true })
		.selectOption('px');
	await page
		.getByRole('spinbutton', { name: 'Column 1 width', exact: true })
		.fill('900');
	await page
		.getByRole('group', { name: 'Column 2 width', exact: true })
		.getByRole('combobox', { name: 'Select unit', exact: true })
		.selectOption('px');
	await page
		.getByRole('spinbutton', { name: 'Column 2 width', exact: true })
		.fill('300');
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'M1 display', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	expect(
		(await tree(page))[0].innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.tag
	).toBe('th');
	expect(
		(await tree(page))[0].innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.scope
	).toBe('col');
	await page.goto(`/?p=${id}`);
	const table = page
		.locator('table.wp-block-modular-table-blocks-table')
		.first();
	await expect(table.locator('thead > tr > th[scope="col"]')).toHaveCount(2);
	await expect(table.locator('tbody > tr > td')).toHaveCount(2);
	await expect(table.locator('thead > tr > th').first()).toHaveCSS(
		'text-align',
		'right'
	);
	await expect(table.locator('thead > tr > th').first()).toHaveCSS(
		'vertical-align',
		'bottom'
	);
	await expect(table.locator('col').first()).toHaveAttribute(
		'style',
		'--mtb-column-width:900px'
	);
	await page.setViewportSize({ width: 375, height: 812 });
	const region = page.getByRole('region', { name: 'M1 table', exact: true });
	await region.focus();
	await expect(region).toBeFocused();
	await expect
		.poll(() =>
			region.evaluate((node) => node.scrollWidth > node.clientWidth)
		)
		.toBe(true);
	await page.keyboard.press('ArrowRight');
	await expect
		.poll(() => region.evaluate((node) => node.scrollLeft))
		.toBeGreaterThan(0);
	await expect(table.locator('tbody > tr > td').first()).toHaveCSS(
		'display',
		'table-cell'
	);
});
test('rich nested content survives duplication, list view selection and clipboard paste', async ({
	page,
	context,
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const cell = table.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		const children = [
			createBlock('core/heading', { content: 'Rich heading' }),
			createBlock('core/list', {}, [
				createBlock('core/list-item', { content: 'Nested list item' }),
			]),
			createBlock('core/image', {
				url: `${window.location.origin}/wp-includes/images/w-logo-blue.png`,
				alt: 'Test image',
			}),
			createBlock('core/buttons', {}, [
				createBlock('core/button', {
					text: 'Example button',
					url: 'https://example.com/',
				}),
			]),
		];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(cell.clientId, children, false);
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	await structureAction(page, 'Duplicate row');
	const nested = (await tree(page))[0].innerBlocks;
	expect(
		nested
			.find((cell) => cell.attributes.row === 1)!
			.innerBlocks.map((b) => b.name)
	).toEqual(['core/heading', 'core/list', 'core/image', 'core/buttons']);
	const serialized = await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		return window.wp.blocks.serialize([table]);
	});
	const listView = page.getByRole('button', {
		name: 'Document Overview',
		exact: true,
	});
	await listView.click();
	await expect(page.getByRole('treegrid')).toBeVisible();
	await page
		.getByRole('treegrid')
		.getByRole('link', { name: /Table Cell/ })
		.first()
		.click();
	expect(
		await page.evaluate(() =>
			window.wp.data
				.select('core/block-editor')
				.getSelectedBlockClientId()
		)
	).toBe(nested[0].clientId);
	await listView.click();
	const paragraphId = await page.evaluate(async (source) => {
		await navigator.clipboard.writeText(source);
		const paragraph = window.wp.blocks.createBlock('core/paragraph');
		window.wp.data
			.dispatch('core/block-editor')
			.insertBlocks([paragraph], undefined, '');
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(paragraph.clientId);
		return paragraph.clientId;
	}, serialized);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await canvas.locator(`[data-block="${paragraphId}"]`).click();
	await page.keyboard.press('ControlOrMeta+v');
	await expect
		.poll(
			async () =>
				(await tree(page)).filter(
					(b) => b.name === 'modular-table-blocks/table'
				).length
		)
		.toBe(3);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'M1 rich content', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	expect(
		await page.evaluate(() => {
			const all = window.wp.blocks.parse(
				window.wp.data.select('core/editor').getEditedPostContent()
			);
			const valid = (blocks: typeof all): boolean =>
				blocks.every((b) => b.isValid && valid(b.innerBlocks));
			return valid(all);
		})
	).toBe(true);
	await page.goto(`/?p=${id}`);
	const table = page
		.locator('table.wp-block-modular-table-blocks-table')
		.first();
	await expect(table.locator('h2')).toHaveCount(2);
	await expect(table.locator('ul > li')).toHaveCount(2);
	await expect(table.locator('img[alt="Test image"]')).toHaveCount(2);
	await expect(table.locator('a.wp-block-button__link')).toHaveCount(2);
	await expect(
		table.locator(':scope > tbody > tr > :not(td,th)')
	).toHaveCount(0);
});
test('stale confirmations and merged grids cannot delete unrelated content', async ({
	page,
}) => {
	await structureAction(page, 'Delete column');
	await page.evaluate(() => {
		const first = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(first.clientId, {
				content: 'Edited during confirmation',
			});
	});
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'The table changed while confirmation was open. Review the operation again.',
				{ exact: true }
			)
	).toBeVisible();
	expect(await content(page)).toEqual([
		['Edited during confirmation', 'B'],
		['C', 'D'],
	]);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId,
				{ colSpan: 2 }
			);
	});
	const menu = await structureMenu(page);
	await expect(
		menu.getByRole('menuitem', { name: 'Delete column', exact: true })
	).toBeDisabled();
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'The table grid is inconsistent. Structure changes are disabled.',
				{ exact: true }
			)
	).toBeVisible();
});
