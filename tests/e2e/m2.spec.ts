import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{ columns: [{}, {}, {}], caption: 'M2 table' },
			Array.from({ length: 3 }, (_row, r) =>
				Array.from({ length: 3 }, (_cell, c) =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', {
							content: String.fromCharCode(65 + r * 3 + c),
						}),
					])
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			);
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
			.innerBlocks.flatMap((c) =>
				c.innerBlocks.map((b) => String(b.attributes.content ?? ''))
			)
	);
async function select(page: Page, row: number, cell: number) {
	await page.evaluate(
		({ r, c }) =>
			window.wp.data.dispatch('core/block-editor').selectBlock(
				window.wp.data
					.select('core/block-editor')
					.getBlocks()[0]
					.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c].clientId
			),
		{ r: row, c: cell }
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
function mergeToggle(page: Page) {
	return page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Merge and split cells', exact: true });
}
async function action(page: Page, name: string) {
	if (name === 'Merge cells' || name === 'Split cell') {
		const toggle = mergeToggle(page);
		await expect(toggle).toHaveAttribute(
			'aria-pressed',
			String(name === 'Split cell')
		);
		await toggle.click();
		return;
	}
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
	const origin = await page.evaluate(() => {
		const store = window.wp.data.select('core/block-editor');
		return store
			.getBlocks()[0]
			.innerBlocks.find(
				(cell) => cell.clientId === store.getSelectedBlockClientId()
			)!.attributes;
	});
	await dialog
		.getByRole('button', {
			name: `End at row ${Number(origin.row) + Number(rows)}, column ${Number(origin.column) + Number(columns)}`,
			exact: true,
		})
		.click();
	await dialog
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	const confirmation = page.getByRole('dialog', {
		name: 'Delete other cell contents?',
		exact: true,
	});
	await expect(confirmation).toBeVisible();
	await confirmation
		.getByRole('button', { name: 'Delete contents and merge', exact: true })
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

test('merge approval deletes locked non-origin contents while retaining the locked table, origin and unrelated cells', async ({
	page,
}) => {
	const blockedIds = await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			lock: { move: true, remove: true },
		});
		for (const cell of [
			table.innerBlocks[0],
			table.innerBlocks[1],
			table.innerBlocks[2],
		]) {
			actions.updateBlockAttributes(cell.clientId, {
				lock: { move: true, remove: true },
			});
		}
		actions.updateBlockAttributes(
			table.innerBlocks[0].innerBlocks[0].clientId,
			{ lock: { remove: true } }
		);
		const nested = window.wp.blocks.createBlock(
			'core/group',
			{ lock: { move: true, remove: true } },
			[
				window.wp.blocks.createBlock('core/paragraph', {
					content: 'Locked nested target',
					lock: { remove: true },
				}),
			]
		);
		actions.replaceInnerBlocks(
			table.innerBlocks[1].clientId,
			[nested],
			false
		);
		actions.updateBlockAttributes(
			table.innerBlocks[3].innerBlocks[0].clientId,
			{ lock: { remove: true } }
		);
		actions.replaceInnerBlocks(
			table.innerBlocks[4].clientId,
			[
				window.wp.blocks.createBlock('core/image', {
					url: `${location.origin}/wp-includes/images/w-logo-blue.png`,
					alt: 'Locked target image',
					lock: { remove: true },
				}),
			],
			false
		);
		return [
			table.clientId,
			table.innerBlocks[1].clientId,
			nested.clientId,
			table.innerBlocks[3].innerBlocks[0].clientId,
		];
	});
	expect(
		await page.evaluate(
			(ids) =>
				ids.map((id) =>
					window.wp.data
						.select('core/block-editor')
						.canRemoveBlocks([id])
				),
			blockedIds
		)
	).toEqual([false, false, false, false]);
	const before = await tree(page);
	const originContents = before.innerBlocks[0].innerBlocks;
	await action(page, 'Merge cells');
	const picker = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await picker
		.getByRole('button', { name: 'End at row 2, column 2', exact: true })
		.click();
	await picker
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	const confirmation = page.getByRole('dialog', {
		name: 'Delete other cell contents?',
		exact: true,
	});
	await expect(confirmation).toContainText(
		'Contents in 3 other cells will be deleted, including locked blocks.'
	);
	await expect(
		confirmation.getByRole('button', { name: 'Cancel', exact: true })
	).toBeFocused();
	expect(await tree(page)).toEqual(before);
	await expect
		.poll(() =>
			confirmation.evaluate((node) => {
				for (
					let element: Element | null = node;
					element;
					element = element.parentElement
				) {
					if (getComputedStyle(element).opacity !== '1') {
						return false;
					}
				}
				return true;
			})
		)
		.toBe(true);
	expect(
		(
			await new AxeBuilder({ page })
				.include('.modular-table-blocks-merge')
				.analyze()
		).violations
	).toEqual([]);
	await page.screenshot({
		path: test.info().outputPath('merge-content-approval.png'),
	});
	await confirmation
		.getByRole('button', { name: 'Back to range selection', exact: true })
		.click();
	await expect(
		picker.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeFocused();
	await picker
		.getByRole('button', { name: 'End at row 1, column 2', exact: true })
		.click();
	await picker
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	await expect(confirmation).toContainText(
		'Contents in 1 other cell will be deleted'
	);
	await confirmation
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	expect(await tree(page)).toEqual(before);
	await merge(page, '2', '2');
	const after = await tree(page);
	expect(after.clientId).toBe(before.clientId);
	expect(after.attributes).toEqual(before.attributes);
	expect(after.innerBlocks).toHaveLength(6);
	expect(after.innerBlocks[0].innerBlocks).toEqual(originContents);
	expect(after.innerBlocks[0].attributes).toMatchObject({
		colSpan: 2,
		rowSpan: 2,
		lock: { move: true, remove: true },
	});
	for (const original of before.innerBlocks.filter(
		(cell) =>
			Number(cell.attributes.column) >= 2 ||
			Number(cell.attributes.row) >= 2
	)) {
		expect(
			after.innerBlocks.find(
				(cell) => cell.clientId === original.clientId
			)
		).toEqual(original);
	}
	const allIds = (blocks: typeof after.innerBlocks): string[] =>
		blocks.flatMap((block) => [
			block.clientId,
			...allIds(block.innerBlocks),
		]);
	for (const removed of [
		before.innerBlocks[1],
		before.innerBlocks[3],
		before.innerBlocks[4],
	]) {
		for (const id of allIds([removed])) {
			expect(allIds(after.innerBlocks)).not.toContain(id);
		}
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => tree(page)).toEqual(before);
	expect(
		await page.evaluate(
			(ids) =>
				ids.map((id) =>
					window.wp.data
						.select('core/block-editor')
						.canRemoveBlocks([id])
				),
			blockedIds
		)
	).toEqual([false, false, false, false]);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => tree(page)).toEqual(after);
	await save(page);
	await reload(page);
	expect((await tree(page)).attributes.lock).toEqual(before.attributes.lock);
	expect(
		(await tree(page)).innerBlocks[0].innerBlocks.map(
			(block) => block.attributes.lock
		)
	).toEqual(originContents.map((block) => block.attributes.lock));
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	await expect(page.locator('td[colspan="2"][rowspan="2"]')).toHaveText('A');
	await expect(
		page.getByText('Locked nested target', { exact: true })
	).toHaveCount(0);
	await expect(
		page.getByAltText('Locked target image', { exact: true })
	).toHaveCount(0);
});

test('merge approval is invalidated when content or locks change before confirmation', async ({
	page,
}) => {
	const before = await tree(page);
	await action(page, 'Merge cells');
	const picker = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await picker
		.getByRole('button', { name: 'End at row 2, column 2', exact: true })
		.click();
	await picker
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	const confirmation = page.getByRole('dialog', {
		name: 'Delete other cell contents?',
		exact: true,
	});
	await expect(confirmation).toBeVisible();
	await page.evaluate(
		(id) =>
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(id, {
					content: 'Changed after warning',
					lock: { remove: true },
				}),
		before.innerBlocks[1].innerBlocks[0].clientId
	);
	const changed = await tree(page);
	await expect(confirmation).toContainText(
		'The table changed. Close and reopen this dialog before merging.'
	);
	await expect(
		confirmation.getByRole('button', {
			name: 'Delete contents and merge',
			exact: true,
		})
	).toBeDisabled();
	await confirmation
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	expect(await tree(page)).toEqual(changed);
});

test('merging empty non-origin cells does not request content deletion approval', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		for (const cell of table.innerBlocks.slice(1)) {
			actions.replaceInnerBlocks(cell.clientId, [], false);
			actions.updateBlockAttributes(cell.clientId, {
				lock: { remove: true },
			});
		}
	});
	const before = await tree(page);
	await action(page, 'Merge cells');
	const picker = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await picker
		.getByRole('button', { name: 'End at row 2, column 2', exact: true })
		.click();
	await picker
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	await expect(picker).toBeHidden();
	await expect(
		page.getByRole('dialog', {
			name: 'Delete other cell contents?',
			exact: true,
		})
	).toHaveCount(0);
	expect((await tree(page)).innerBlocks[0].innerBlocks).toEqual(
		before.innerBlocks[0].innerBlocks
	);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => tree(page)).toEqual(before);
});

test('merge toggle reflects cell geometry and splits on a second press through undo and reload', async ({
	page,
}) => {
	const original = await tree(page);
	const toggle = mergeToggle(page);
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(toggle).not.toHaveClass(/is-pressed/);
	await merge(page, '1', '2');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle).toHaveClass(/is-pressed/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.screenshot({
			path: test.info().outputPath('merge-toggle-pressed.png'),
		});
	await select(page, 0, 1);
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await select(page, 0, 0);
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await toggle.focus();
	await toggle.press('Space');
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(toggle).not.toHaveClass(/is-pressed/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect((await tree(page)).innerBlocks).toHaveLength(9);
	expect((await tree(page)).innerBlocks[0].innerBlocks).toEqual(
		original.innerBlocks[0].innerBlocks
	);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await select(page, 0, 0);
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await select(page, 0, 0);
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await save(page);
	await reload(page);
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(toggle).not.toHaveClass(/is-pressed/);
	await page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.screenshot({
			path: test.info().outputPath('merge-toggle-unpressed.png'),
		});
});

test('merge toggle opens the range dialog directly, supports keyboard and cancels without changes', async ({
	page,
}) => {
	const before = await tree(page);
	const toolbar = page.getByRole('toolbar', {
		name: 'Block tools',
		exact: true,
	});
	const mergeButton = toolbar.getByRole('button', {
		name: 'Merge and split cells',
		exact: true,
	});
	await expect(mergeButton).toHaveAttribute('aria-pressed', 'false');
	await expect(mergeButton).not.toHaveAttribute('aria-expanded');
	const structure = await menu(page);
	await expect(
		structure.getByRole('menuitem', { name: /^(Merge cells|Split cell)$/ })
	).toHaveCount(0);
	await page.keyboard.press('Escape');
	await mergeButton.focus();
	await mergeButton.press('Enter');
	await expect(
		page.getByRole('menu', { name: 'Merge and split cells', exact: true })
	).toHaveCount(0);
	const modal = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await expect(modal.getByRole('combobox')).toHaveCount(0);
	await expect(
		modal
			.getByRole('group', { name: 'End cell', exact: true })
			.getByRole('button')
	).toHaveCount(9);
	await expect(
		modal.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	const end = modal.getByRole('button', {
		name: 'End at row 1, column 2',
		exact: true,
	});
	await end.focus();
	await end.press('ArrowDown');
	const next = modal.getByRole('button', {
		name: 'End at row 2, column 2',
		exact: true,
	});
	await expect(next).toBeFocused();
	await next.press('Enter');
	await expect(next).toHaveAttribute('aria-pressed', 'true');
	await expect(modal.getByRole('status')).toHaveText(
		'Merge range: 2 rows × 2 columns'
	);
	await expect(
		modal.locator('.modular-table-blocks-merge__selection')
	).toHaveCount(1);
	expect(await tree(page)).toEqual(before);
	await expect
		.poll(() =>
			modal.evaluate((node) => {
				for (
					let element: Element | null = node;
					element;
					element = element.parentElement
				) {
					if (getComputedStyle(element).opacity !== '1') {
						return false;
					}
				}
				return true;
			})
		)
		.toBe(true);
	await modal.evaluate(async (node) => {
		await Promise.all(
			node
				.getAnimations({ subtree: true })
				.map((animation) => animation.finished.catch(() => undefined))
		);
	});
	expect(
		(
			await new AxeBuilder({ page })
				.include('.modular-table-blocks-merge')
				.analyze()
		).violations
	).toEqual([]);
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(modal).toBeVisible();
	await page.screenshot({
		path: test.info().outputPath('merge-range-mobile.png'),
	});
	await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(modal).toBeHidden();
	expect(await tree(page)).toEqual(before);
	await expect(mergeButton).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 720 });
	await select(page, 0, 0);
	await mergeButton.focus();
	await mergeButton.press('Enter');
	await expect(
		modal.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(mergeButton).toBeFocused();
});

test('merge toggle disables unavailable merges but keeps pressed merged cells available for splitting', async ({
	page,
}) => {
	const before = await tree(page);
	async function check(
		row: number,
		cell: number,
		canMerge: boolean,
		canSplit = false
	) {
		await select(page, row, cell);
		const toggle = mergeToggle(page);
		await expect(toggle).toBeEnabled({ enabled: canMerge || canSplit });
		await expect(toggle).toHaveAttribute('aria-pressed', String(canSplit));
		if (canSplit) {
			await expect(toggle).toHaveClass(/is-pressed/);
		} else {
			await expect(toggle).not.toHaveClass(/is-pressed/);
		}
		await expect(
			page.getByRole('menu', {
				name: 'Merge and split cells',
				exact: true,
			})
		).toHaveCount(0);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}
	await check(2, 2, false);
	await check(2, 1, true);
	await check(1, 2, true);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { headerRows: 1 });
	});
	await check(0, 2, false);
	await check(0, 1, true);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, { headerRows: 0 });
		actions.replaceInnerBlocks(
			table.clientId,
			window.mtbMergeCells(table, 1, 1, 2, 1),
			false
		);
	});
	await check(2, 0, false);
	await check(1, 0, true);
	await page.evaluate((original) => {
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.resetBlocks([
			{
				...original,
				innerBlocks: window.mtbMergeCells(original, 0, 0, 3, 3),
			},
		]);
	}, before);
	await check(0, 0, false, true);
	await action(page, 'Split cell');
	expect((await tree(page)).innerBlocks).toHaveLength(9);
	await check(0, 0, true);
	await page.evaluate((original) => {
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([
				{ ...original, innerBlocks: original.innerBlocks.slice(0, -1) },
			]);
	}, before);
	await check(0, 0, false);
});

test('merge picker restricts maximum extent at crossing cells and preserves existing merged shapes', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 1, 2, 1),
				false
			);
	});
	await select(page, 1, 0);
	await action(page, 'Merge cells');
	const modal = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await expect(
		modal.getByRole('button', {
			name: 'Start cell: row 2, column 1',
			exact: true,
		})
	).toContainText('Start');
	await expect(
		modal
			.getByRole('group', { name: 'End cell', exact: true })
			.getByRole('button')
	).toHaveCount(2);
	await expect(
		modal.getByRole('button', {
			name: 'End at row 3, column 1',
			exact: true,
		})
	).toBeEnabled();
	await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
	await select(page, 0, 0);
	await action(page, 'Merge cells');
	await expect(
		modal.getByRole('button', {
			name: 'End at row 1, column 3',
			exact: true,
		})
	).toBeDisabled();
	const mergedEnd = modal.getByRole('button', {
		name: 'End at row 2, column 2',
		exact: true,
	});
	await expect(mergedEnd).toHaveCSS('grid-row', '1 / 3');
	await mergedEnd.click();
	await expect(modal.getByRole('status')).toHaveText(
		'Merge range: 2 rows × 2 columns'
	);
	await modal.evaluate(async (node) => {
		await Promise.all(
			node
				.getAnimations({ subtree: true })
				.map((animation) => animation.finished.catch(() => undefined))
		);
	});
	await expect(mergedEnd).toHaveCSS(
		'background-color',
		await modal
			.getByRole('button', { name: 'Merge cells', exact: true })
			.evaluate((node) => getComputedStyle(node).backgroundColor)
	);
	await page.screenshot({
		path: test.info().outputPath('merge-existing-shapes.png'),
	});
	await modal
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	await page
		.getByRole('dialog', {
			name: 'Delete other cell contents?',
			exact: true,
		})
		.getByRole('button', { name: 'Delete contents and merge', exact: true })
		.click();
	await expect(modal).toBeHidden();
	expect((await tree(page)).innerBlocks[0].attributes).toMatchObject({
		colSpan: 2,
		rowSpan: 2,
	});
	await select(page, 2, 2);
	await expect(mergeToggle(page)).toBeDisabled();
	await expect(modal).toBeHidden();
	await page.keyboard.press('Escape');
});
for (const range of [
	{ rows: '1', columns: '2' },
	{ rows: '2', columns: '1' },
	{ rows: '2', columns: '2' },
]) {
	test(`merged editor borders fill ${range.rows}×${range.columns} tracks beside taller content`, async ({
		page,
	}) => {
		const before = await tree(page);
		const topRightId = before.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[2].clientId;
		const bottomRightId = before.innerBlocks.filter(
			(candidate) => candidate.attributes.row === Number(range.rows) - 1
		)[2].clientId;
		const nextColumnId = before.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[Number(range.columns)].clientId;
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
		const anchorId = (await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].clientId;
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
		const settings = page.getByRole('tab', {
			name: 'Styles',
			exact: true,
		});
		if (await settings.isVisible()) {
			await settings.click();
		}
		const topLeft = page
			.locator('.modular-table-blocks-alignment-matrix')
			.getByRole('gridcell')
			.first();
		await topLeft.focus();
		await topLeft.press('Enter');
		await checkEdges();
		for (let step = 0; step < 2; step++) {
			await page.keyboard.press('ArrowDown');
			await expect
				.poll(
					async () =>
						(await tree(page)).innerBlocks.filter(
							(candidate) => candidate.attributes.row === 0
						)[0].attributes.verticalAlign
				)
				.toBe(step === 0 ? 'middle' : 'bottom');
			await checkEdges();
		}
		await page.screenshot({
			path: test.info().outputPath('merged-borders.png'),
			fullPage: true,
		});
	});
}
test('rectangular merge and split retain origin content, grid geometry, undo and saved HTML', async ({
	page,
	browserName,
}) => {
	const before = await tree(page);
	await merge(page, '2', '2');
	let current = await tree(page);
	expect(
		Array.from(
			{ length: Number(current.attributes.rowCount) },
			(_, r) =>
				current.innerBlocks.filter((c) => c.attributes.row === r).length
		)
	).toEqual([2, 1, 3]);
	expect(
		current.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes
	).toMatchObject({
		rowSpan: 2,
		colSpan: 2,
	});
	expect(await allText(page)).toEqual(['A', 'C', 'F', 'G', 'H', 'I']);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const anchor = canvas.locator(
		`[data-block="${current.innerBlocks.filter((candidate) => candidate.attributes.row === 0)[0].clientId}"]`
	);
	const last = canvas.locator(
		`[data-block="${current.innerBlocks.filter((candidate) => candidate.attributes.row === 1)[0].clientId}"]`
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
		.getByRole('link', { name: /Table Cell/ })
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
	const paragraph = anchor.locator('[contenteditable="true"]').first();
	await page.bringToFront();
	if (browserName === 'firefox') {
		await anchor.click({ position: { x: 4, y: 4 } });
		await expect(anchor).toBeFocused();
	}
	await paragraph.click();
	await test.info().attach('merged-focus.json', {
		body: JSON.stringify(
			await paragraph.evaluate((node) => ({
				focused: node.ownerDocument.activeElement === node,
				documentFocused: node.ownerDocument.hasFocus(),
				active: node.ownerDocument.activeElement?.outerHTML.slice(
					0,
					700
				),
				paragraph: node.getAttribute('data-block'),
			}))
		),
		contentType: 'application/json',
	});
	await expect(paragraph).toBeFocused();
	expect(
		await paragraph.evaluate((node) => {
			const selection = node.ownerDocument.defaultView?.getSelection();
			return (
				!!selection?.anchorNode && node.contains(selection.anchorNode)
			);
		})
	).toBe(true);
	await select(page, 0, 0);
	await page.screenshot({
		path: test.info().outputPath('merged-editor.png'),
		fullPage: true,
	});
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect((await tree(page)).innerBlocks).toEqual(before.innerBlocks);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.rowSpan
	).toBe(2);
	await save(page);
	await reload(page);
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes
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
	).toHaveText(['A']);
	await expect(
		publicPage.locator('table > div, tbody > div, tr > div')
	).toHaveCount(0);
	await publicPage.close();
	await action(page, 'Split cell');
	current = await tree(page);
	expect(
		Array.from(
			{ length: Number(current.attributes.rowCount) },
			(_, r) =>
				current.innerBlocks.filter((c) => c.attributes.row === r).length
		)
	).toEqual([3, 3, 3]);
	expect((await allText(page)).filter(Boolean)).toEqual([
		'A',
		'C',
		'F',
		'G',
		'H',
		'I',
	]);
	await save(page);
	await reload(page);
	expect(
		await page.evaluate(() =>
			window
				.mtbRows(
					window.wp.data.select('core/block-editor').getBlocks()[0]
				)
				.map((cells) => cells.length)
		)
	).toEqual([3, 3, 3]);
});
test('row and column edits expand or shrink merged cells and retain their content', async ({
	page,
}) => {
	await merge(page, '2', '2');
	const id = (await tree(page)).innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0].clientId;
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
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.colSpan
	).toBe(3);
	await select(page, 0, 0);
	await action(page, 'Insert row below');
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.rowSpan
	).toBe(3);
	const dropdown = await menu(page);
	await expect(
		dropdown.getByRole('menuitem', { name: 'Duplicate row', exact: true })
	).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(
		page.getByRole('button', { name: 'Move rows and columns', exact: true })
	).toBeDisabled();
	await action(page, 'Delete column');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.colSpan
	).toBe(2);
	await select(page, 0, 0);
	await action(page, 'Delete row');
	await page
		.getByRole('button', { name: 'Delete content', exact: true })
		.click();
	const anchor = (await tree(page)).innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0];
	expect(anchor.clientId).toBe(id);
	expect(anchor.attributes.rowSpan).toBe(2);
	expect((await allText(page)).filter(Boolean)).toEqual(['A', 'F', 'H', 'I']);
	await save(page);
	await reload(page);
	expect((await allText(page)).filter(Boolean)).toEqual(['A', 'F', 'H', 'I']);
});
test('partial ranges, header boundaries and changed merge confirmations are rejected', async ({
	page,
}) => {
	await select(page, 0, 1);
	await merge(page, '1', '2');
	await select(page, 0, 0);
	await action(page, 'Merge cells');
	const dialog = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await expect(
		dialog.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	await expect(
		dialog.getByRole('button', {
			name: 'Start cell: row 1, column 1',
			exact: true,
		})
	).toBeDisabled();
	await expect(
		dialog.getByRole('button', {
			name: 'End at row 1, column 2',
			exact: true,
		})
	).toHaveCount(0);
	await dialog
		.getByRole('button', { name: 'End at row 1, column 3', exact: true })
		.click();
	await page.evaluate(() => {
		const block = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(block.clientId, { content: 'Edited' });
	});
	await expect(
		dialog.getByRole('button', { name: 'Merge cells', exact: true })
	).toBeDisabled();
	await expect(dialog).toContainText(
		'The table changed. Close and reopen this dialog before merging.'
	);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[1].attributes.colSpan
	).toBe(2);
	await select(page, 0, 1);
	await action(page, 'Split cell');
	await select(page, 0, 0);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { headerRows: 1 });
	});
	await action(page, 'Merge cells');
	await expect(
		dialog.getByRole('button', {
			name: 'End at row 2, column 1',
			exact: true,
		})
	).toHaveCount(0);
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
	await page
		.getByLabel('Use first row as headers (TH)', { exact: true })
		.click();
	await expect(
		page.getByLabel('Use first row as headers (TH)', { exact: true })
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
		const cell = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
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
		await page.evaluate(() =>
			window
				.mtbRows(
					window.wp.data.select('core/block-editor').getBlocks()[0]
				)
				.map((cells) => cells.length)
		)
	).toEqual([1, 0, 0]);
	await save(page);
	await reload(page);
	expect(
		await page.evaluate(() =>
			window
				.mtbRows(
					window.wp.data.select('core/block-editor').getBlocks()[0]
				)
				.map((cells) => cells.length)
		)
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
		await page.evaluate(() =>
			window
				.mtbRows(
					window.wp.data.select('core/block-editor').getBlocks()[0]
				)
				.map((cells) => cells.length)
		)
	).toEqual([3, 3, 3]);
	expect(
		(await tree(page)).innerBlocks
			.filter((candidate) => candidate.attributes.row === 0)[0]
			.innerBlocks.filter((b) => b.name === 'core/list')
	).toHaveLength(1);
});
