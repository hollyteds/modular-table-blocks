import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';
const TEXT = 'modular-table-blocks/cell-text';
const frame = (page: Page) => page.frameLocator('iframe[name="editor-canvas"]');
const tree = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		window.wp.data.dispatch('core/block-editor').resetBlocks([
			window.mtbCreateTable({ columns: [{}, {}] }, [
				[
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('modular-table-blocks/cell-text', {
							content: 'Text one',
						}),
					]),
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', {
							content: 'Normal block',
						}),
					]),
				],
				[
					createBlock('modular-table-blocks/cell'),
					createBlock('modular-table-blocks/cell'),
				],
			]),
		]);
	});
	await expect(
		frame(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
});

test('cell text is exclusive per cell while other cells and normal block collections stay available', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[0].clientId);
	});
	await expect(
		frame(page)
			.locator('.modular-table-blocks-editor__cell')
			.nth(0)
			.locator('button.block-editor-inserter__toggle')
	).toHaveCount(0);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[1].clientId);
	});
	await frame(page)
		.locator('.modular-table-blocks-editor__cell')
		.nth(1)
		.locator('button.block-editor-inserter__toggle')
		.click();
	await expect(page.getByRole('option', { name: /Cell text$/ })).toHaveCount(
		0
	);
	await page.getByRole('option', { name: 'Paragraph', exact: true }).click();
	await expect
		.poll(async () => (await tree(page)).innerBlocks[1].innerBlocks.length)
		.toBe(2);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[2].clientId);
	});
	await frame(page)
		.locator('.modular-table-blocks-editor__cell')
		.nth(2)
		.locator('button.block-editor-inserter__toggle')
		.click();
	await page.getByRole('option', { name: /Cell text$/ }).click();
	expect((await tree(page)).innerBlocks[2].innerBlocks[0].name).toBe(TEXT);
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks[0].attributes.content
	).toBe('Text one');
});

test('groups cannot be added to cells while existing groups remain editable through reload and public rendering', async ({
	page,
}) => {
	const before = (await tree(page)).innerBlocks[0].innerBlocks;
	await expect
		.poll(() =>
			page.evaluate(() => {
				const editor = window.wp.data.select('core/block-editor');
				const cells = editor.getBlocks()[0].innerBlocks;
				return {
					groups: [1, 2].map((index) =>
						editor.canInsertBlockType(
							'core/group',
							cells[index].clientId
						)
					),
					paragraphs: [1, 2].map((index) =>
						editor.canInsertBlockType(
							'core/paragraph',
							cells[index].clientId
						)
					),
					outsideTable: editor.canInsertBlockType('core/group'),
				};
			})
		)
		.toEqual({
			groups: [false, false],
			paragraphs: [true, true],
			outsideTable: true,
		});
	await page.evaluate(() => {
		const cells = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0].innerBlocks;
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(cells[2].clientId);
	});
	const cell = frame(page)
		.locator('.modular-table-blocks-editor__cell')
		.nth(2);
	await cell.locator('button.block-editor-inserter__toggle').click();
	await expect(
		page.getByRole('option', { name: 'Paragraph', exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('option', { name: 'Group', exact: true })
	).toHaveCount(0);
	await page.keyboard.press('Escape');
	// Loading a previously saved group must not remove its nested content.
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const cells = table.innerBlocks;
		const actions = window.wp.data.dispatch('core/block-editor');
		const existing = createBlock('core/group', {}, [
			createBlock('core/heading', {
				level: 3,
				content: 'Group heading',
			}),
			createBlock('core/group', { layout: { type: 'constrained' } }, [
				createBlock('core/paragraph', { content: 'Grouped text' }),
			]),
		]);
		actions.resetBlocks([
			{
				...table,
				innerBlocks: cells.map((block, index) =>
					index === 2 ? { ...block, innerBlocks: [existing] } : block
				),
			},
		]);
		actions.selectBlock(cells[2].clientId);
	});
	expect((await tree(page)).innerBlocks[0].innerBlocks).toEqual(before);
	const paragraph = cell.locator('.wp-block-group p[contenteditable="true"]');
	await cell.click({ position: { x: 6, y: 6 } });
	await paragraph.click();
	await expect(paragraph).toBeFocused();
	await paragraph.press('End');
	await paragraph.pressSequentially(' edited');
	await expect(paragraph).toHaveText('Grouped text edited');
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Existing cell groups', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await expect(paragraph).toHaveText('Grouped text edited');
	const saved = (await tree(page)).innerBlocks[2].innerBlocks[0];
	expect(saved.name).toBe('core/group');
	expect(saved.isValid).toBe(true);
	expect(saved.innerBlocks.map((block) => block.name)).toEqual([
		'core/heading',
		'core/group',
	]);
	expect(saved.innerBlocks[1].innerBlocks[0].isValid).toBe(true);
	await page.goto(`/?p=${id}`);
	const group = page
		.locator('table.wp-block-modular-table-blocks-table > tbody > tr')
		.nth(1)
		.locator(':scope > td')
		.first()
		.locator(':scope > .wp-block-group');
	await expect(group.locator(':scope > h3')).toHaveText('Group heading');
	await expect(group.locator(':scope > .wp-block-group > p')).toHaveText(
		'Grouped text edited'
	);
	await expect(
		page.locator('table > div, tbody > div, tr > div')
	).toHaveCount(0);
});

test('invalid duplicate, paste batches, replacements and moves are rejected before changing either cell', async ({
	page,
}) => {
	const before = await tree(page);
	await page.evaluate(async () => {
		const actions = window.wp.data.dispatch('core/block-editor');
		const cells = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0].innerBlocks;
		const text = cells[0].innerBlocks[0];
		const paragraph = cells[1].innerBlocks[0];
		const { createBlock } = window.wp.blocks;
		await actions.duplicateBlocks([text.clientId]);
		await actions.insertBlocks(
			[createBlock('core/paragraph', { content: 'Rejected' })],
			1,
			cells[0].clientId
		);
		await actions.insertBlocks(
			[
				createBlock('modular-table-blocks/cell-text'),
				createBlock('modular-table-blocks/cell-text'),
			],
			0,
			cells[2].clientId
		);
		await actions.insertBlocks(
			[
				createBlock('core/paragraph'),
				createBlock('modular-table-blocks/cell-text'),
			],
			0,
			cells[3].clientId
		);
		await actions.moveBlocksToPosition(
			[text.clientId],
			cells[0].clientId,
			cells[1].clientId,
			0
		);
		await actions.moveBlocksToPosition(
			[paragraph.clientId],
			cells[1].clientId,
			cells[0].clientId,
			0
		);
		await actions.replaceBlocks(
			[text.clientId],
			[
				createBlock('core/paragraph'),
				createBlock('modular-table-blocks/cell-text'),
			]
		);
	});
	expect(await tree(page)).toEqual(before);
	await expect(
		page
			.locator('.components-snackbar__content')
			.getByText(
				'Use one Cell text block on its own, or other blocks without Cell text. Convert Cell text to a paragraph to add more blocks.'
			)
	).toBeVisible();
	await page.evaluate(async () => {
		const cells = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0].innerBlocks;
		await window.wp.data
			.dispatch('core/block-editor')
			.moveBlocksToPosition(
				[cells[0].innerBlocks[0].clientId],
				cells[0].clientId,
				cells[2].clientId,
				0
			);
	});
	await expect
		.poll(
			async () => (await tree(page)).innerBlocks[2].innerBlocks[0]?.name
		)
		.toBe(TEXT);
	expect((await tree(page)).innerBlocks[0].innerBlocks).toEqual([]);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect
		.poll(
			async () => (await tree(page)).innerBlocks[0].innerBlocks[0]?.name
		)
		.toBe(TEXT);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect
		.poll(
			async () => (await tree(page)).innerBlocks[2].innerBlocks[0]?.name
		)
		.toBe(TEXT);
	// Removing the sole text restores the standard empty-cell inserter.
	await page.evaluate(() => {
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[2];
		window.wp.data
			.dispatch('core/block-editor')
			.removeBlocks([cell.innerBlocks[0].clientId]);
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	await frame(page)
		.locator('.modular-table-blocks-editor__cell')
		.nth(2)
		.locator('button.block-editor-inserter__toggle')
		.click();
	await expect(
		page.getByRole('option', { name: /Cell text$/ })
	).toBeVisible();
});

test('imported mixed content is preserved and can be repaired by converting text to paragraphs', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = structuredClone(
			window.wp.data.select('core/block-editor').getBlocks()[0]
		);
		table.innerBlocks[0].innerBlocks.push(
			createBlock('modular-table-blocks/cell-text', {
				content: 'Second text',
			}),
			createBlock('core/paragraph', { content: 'Keep paragraph' })
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.innerBlocks[0].clientId);
	});
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'This cell contains Cell text alongside other blocks. Content has been preserved. Convert Cell text to paragraphs or remove extra blocks.'
			)
	).toBeVisible();
	const before = (await tree(page)).innerBlocks[0].innerBlocks;
	expect(before.map((block) => block.attributes.content)).toEqual([
		'Text one',
		'Second text',
		'Keep paragraph',
	]);
	await page.evaluate(async () => {
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[0];
		for (const block of cell.innerBlocks.filter(
			(candidate) => candidate.name === 'modular-table-blocks/cell-text'
		)) {
			await window.wp.data.dispatch('core/block-editor').replaceBlocks(
				[block.clientId],
				[
					window.wp.blocks.createBlock('core/paragraph', {
						content: block.attributes.content,
					}),
				]
			);
		}
	});
	await expect
		.poll(async () =>
			(await tree(page)).innerBlocks[0].innerBlocks.map(
				(block) => block.name
			)
		)
		.toEqual(['core/paragraph', 'core/paragraph', 'core/paragraph']);
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks.map(
			(block) => block.attributes.content
		)
	).toEqual(before.map((block) => block.attributes.content));
	await expect(
		page
			.locator('.components-notice__content')
			.getByText(
				'This cell contains Cell text alongside other blocks. Content has been preserved. Convert Cell text to paragraphs or remove extra blocks.'
			)
	).toHaveCount(0);
});

test('native clipboard block paste cannot create multiple cell text siblings', async ({
	page,
	context,
	browserName,
}) => {
	test.skip(
		browserName !== 'chromium',
		'Clipboard permission is Chromium-specific; atomic action coverage runs in all browsers.'
	);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(async () => {
		const { createBlock, serialize } = window.wp.blocks;
		await navigator.clipboard.writeText(
			serialize([
				createBlock('modular-table-blocks/cell-text', {
					content: 'Paste one',
				}),
				createBlock('modular-table-blocks/cell-text', {
					content: 'Paste two',
				}),
			])
		);
	});
	const input = frame(page).getByRole('textbox', {
		name: 'Cell text',
		exact: true,
	});
	await input.click();
	await input.press('End');
	await input.press('ControlOrMeta+v');
	await expect(input).toContainText('Paste one');
	const blocks = (await tree(page)).innerBlocks[0].innerBlocks;
	expect(blocks).toHaveLength(1);
	expect(blocks[0].name).toBe(TEXT);
	expect(blocks[0].attributes.content).toContain('Text one');
	expect(blocks[0].attributes.content).toContain('Paste two');
});
