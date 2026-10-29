import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';

const editorGrid = (page: Page) =>
	page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cells--grid');
const tree = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
async function spacingPanel(page: Page) {
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await expect(
		page.getByRole('group', { name: 'Cell spacing', exact: true })
	).toBeVisible();
}
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}, {}],
				headerRows: 1,
				styleTokens: { borderWidth: '1px' },
			},
			Array.from({ length: 3 }, (_row, r) =>
				Array.from({ length: 3 }, (_column, c) =>
					window.wp.blocks.createBlock(
						'modular-table-blocks/cell',
						{},
						[
							window.wp.blocks.createBlock(
								'modular-table-blocks/cell-text',
								{ content: `${r + 1}:${c + 1}` }
							),
						]
					)
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	await expect(editorGrid(page)).toBeVisible();
	if (!(await page.locator('.block-editor-block-inspector').isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
	const block = page.getByRole('tab', { name: 'Block', exact: true });
	if (await block.isVisible()) {
		await block.click();
	}
});

async function expectEditorGaps(
	page: Page,
	horizontal: number,
	vertical: number
) {
	await expect
		.poll(() =>
			editorGrid(page).evaluate(
				(grid, expected) => {
					const cells = Array.from(
						grid.querySelectorAll(
							'.modular-table-blocks-editor__cell'
						)
					).map((node) => node.getBoundingClientRect());
					const rect = grid.getBoundingClientRect();
					return Math.max(
						Math.abs(cells[1].left - cells[0].right - expected[0]),
						Math.abs(cells[3].top - cells[0].bottom - expected[1]),
						Math.abs(cells[0].left - rect.left - expected[0]),
						Math.abs(cells[0].top - rect.top - expected[1])
					);
				},
				[horizontal, vertical]
			)
		)
		.toBeLessThan(1);
}

test('border layout UI preserves directional spacing through mode changes undo and reload', async ({
	page,
}) => {
	const before = await tree(page);
	await spacingPanel(page);
	expect(await tree(page)).toEqual(before);
	await expect(
		page.getByRole('radio', { name: 'Collapse borders', exact: true })
	).toBeChecked();
	await expect(
		page.getByRole('spinbutton', {
			name: 'Horizontal spacing',
			exact: true,
		})
	).toHaveCount(0);
	await expectEditorGaps(page, 0, 0);
	await page
		.getByRole('radio', { name: 'Separate borders', exact: true })
		.click();
	await page
		.getByRole('button', { name: 'Unlink axes', exact: true })
		.click();
	await page
		.getByRole('spinbutton', { name: 'Horizontal spacing', exact: true })
		.fill('12');
	await page
		.getByRole('spinbutton', { name: 'Vertical spacing', exact: true })
		.fill('8');
	await page
		.getByRole('spinbutton', { name: 'Vertical spacing', exact: true })
		.press('Tab');
	await expectEditorGaps(page, 12, 8);
	expect((await tree(page)).attributes).toMatchObject({
		borderCollapse: 'separate',
		styleTokens: {
			borderSpacingHorizontal: '12px',
			borderSpacingVertical: '8px',
			borderWidth: '1px',
		},
	});
	expect((await tree(page)).innerBlocks).toEqual(before.innerBlocks);
	await page
		.getByRole('radio', { name: 'Collapse borders', exact: true })
		.click();
	await expectEditorGaps(page, 0, 0);
	expect((await tree(page)).attributes.styleTokens).toMatchObject({
		borderSpacingHorizontal: '12px',
		borderSpacingVertical: '8px',
	});
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expectEditorGaps(page, 12, 8);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expectEditorGaps(page, 0, 0);
	await page
		.getByRole('radio', { name: 'Separate borders', exact: true })
		.click();
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await expectEditorGaps(page, 12, 8);
	await page.goto(`/?p=${id}`);
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	await page.addStyleTag({
		content: 'table { border-collapse: collapse; border-spacing: 50px; }',
	});
	await expect(table).toHaveCSS('border-collapse', 'separate');
	await expect(table).toHaveCSS('border-spacing', '12px 8px');
	await expect
		.poll(() =>
			table.evaluate((node) => {
				const rect = node.getBoundingClientRect();
				const cells = Array.from(node.querySelectorAll('th, td')).map(
					(cell) => cell.getBoundingClientRect()
				);
				return Math.max(
					Math.abs(cells[1].left - cells[0].right - 12),
					Math.abs(cells[3].top - cells[0].bottom - 8),
					Math.abs(cells[0].left - rect.left - 12),
					Math.abs(cells[0].top - rect.top - 8)
				);
			})
		)
		.toBeLessThan(1);
});

test('spacing ranges link axes without writing on toggle and preserve units undo and inherited clearing', async ({
	page,
}) => {
	await spacingPanel(page);
	await page
		.getByRole('radio', { name: 'Separate borders', exact: true })
		.click();
	const before = await tree(page);
	const combined = () =>
		page.getByRole('spinbutton', {
			name: 'Horizontal and vertical spacing',
			exact: true,
		});
	const combinedSlider = () =>
		page.getByRole('slider', {
			name: 'Horizontal and vertical spacing',
			exact: true,
		});
	await expect(combined()).toHaveValue('');
	await expect(combinedSlider()).toHaveValue('0');
	await expect(combinedSlider()).toHaveAttribute('max', '200');
	await page
		.getByRole('button', { name: 'Unlink axes', exact: true })
		.click();
	expect(await tree(page)).toEqual(before);
	await page.getByRole('button', { name: 'Link axes', exact: true }).click();
	expect(await tree(page)).toEqual(before);
	await combinedSlider().focus();
	await combinedSlider().press('Home');
	await combinedSlider().press('ArrowRight');
	await expectEditorGaps(page, 1, 1);
	await combined().fill('12');
	await combined().press('Tab');
	await expectEditorGaps(page, 12, 12);
	await page
		.getByRole('button', { name: 'Unlink axes', exact: true })
		.click();
	const horizontal = page.getByRole('spinbutton', {
		name: 'Horizontal spacing',
		exact: true,
	});
	const vertical = page.getByRole('spinbutton', {
		name: 'Vertical spacing',
		exact: true,
	});
	await horizontal.fill('1');
	await horizontal.press('Tab');
	await page
		.locator('.modular-table-blocks-length-range')
		.filter({ has: horizontal })
		.getByRole('combobox', { name: 'Select unit', exact: true })
		.selectOption('rem');
	const horizontalSlider = page.getByRole('slider', {
		name: 'Horizontal spacing',
		exact: true,
	});
	await expect(horizontalSlider).toHaveAttribute('max', '10');
	await expect(horizontalSlider).toHaveAttribute('step', '0.05');
	await horizontalSlider.focus();
	await horizontalSlider.press('ArrowRight');
	await expect
		.poll(async () => (await tree(page)).attributes.styleTokens)
		.toEqual({
			borderWidth: '1px',
			borderSpacingHorizontal: '1.05rem',
			borderSpacingVertical: '12px',
		});
	await expect(vertical).toHaveValue('12');
	const different = await tree(page);
	await page.getByRole('button', { name: 'Link axes', exact: true }).click();
	expect(await tree(page)).toEqual(different);
	await expect(combined()).toHaveValue('');
	await expect(combined()).toHaveAttribute('placeholder', 'Multiple values');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(async () => (await tree(page)).attributes.styleTokens)
		.not.toEqual(different.attributes.styleTokens);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect
		.poll(async () => (await tree(page)).attributes.styleTokens)
		.toEqual(different.attributes.styleTokens);
	await expect(combined()).toHaveAttribute('placeholder', 'Multiple values');
	await combined().fill('2');
	await combined().press('Tab');
	await expectEditorGaps(page, 2, 2);
	await combined().fill('0');
	await combined().press('Tab');
	await expect
		.poll(async () => (await tree(page)).attributes.styleTokens)
		.toEqual({
			borderWidth: '1px',
			borderSpacingHorizontal: '0px',
			borderSpacingVertical: '0px',
		});
	await combined().fill('');
	await combined().press('Tab');
	await expect
		.poll(async () => (await tree(page)).attributes.styleTokens)
		.toEqual({ borderWidth: '1px' });
	await expect(combinedSlider()).toHaveValue('0');
	await expect(combined()).toHaveValue('');
	expect((await tree(page)).innerBlocks).toEqual(before.innerBlocks);
	await page.screenshot({
		path: test.info().outputPath('linked-spacing-settings.png'),
	});
	await page
		.getByRole('button', { name: 'Unlink axes', exact: true })
		.click();
	await horizontal.fill('8');
	await vertical.fill('12');
	await vertical.press('Tab');
	await expectEditorGaps(page, 8, 12);
	await page.screenshot({
		path: test.info().outputPath('individual-spacing-settings.png'),
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expectEditorGaps(page, 8, 12);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
	await spacingPanel(page);
	await expect(
		page.getByRole('button', { name: 'Link axes', exact: true })
	).toBeVisible();
	await expect(horizontal).toHaveValue('8');
	await expect(vertical).toHaveValue('12');
});

for (const percentages of [false, true]) {
	test(`separate spacing keeps merged geometry preview and clearing intact with ${percentages ? 'percentage' : 'automatic'} columns`, async ({
		page,
	}) => {
		await page.evaluate((fixed) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const actions = window.wp.data.dispatch('core/block-editor');
			actions.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 1, 0, 2, 2),
				false
			);
			actions.updateBlockAttributes(table.clientId, {
				borderCollapse: 'separate',
				columns: fixed
					? [{ width: '20%' }, { width: '30%' }, { width: '50%' }]
					: [{}, {}, {}],
				styleTokens: {
					borderWidth: '1px',
					borderSpacingHorizontal: '20px',
					borderSpacingVertical: '10px',
				},
			});
		}, percentages);
		await expect(editorGrid(page)).toHaveCSS('column-gap', '20px');
		await expect(editorGrid(page)).toHaveCSS('row-gap', '10px');
		await expect
			.poll(() =>
				editorGrid(page).evaluate((node) => {
					const cells = Array.from(
						node.querySelectorAll(
							'.modular-table-blocks-editor__cell'
						)
					).map((cell) => cell.getBoundingClientRect());
					return Math.max(
						Math.abs(cells[3].right - cells[1].right),
						Math.abs(cells[3].bottom - cells[5].bottom),
						node.scrollWidth - node.clientWidth
					);
				})
			)
			.toBeLessThan(1);
		const before = await tree(page);
		const settings = page.getByRole('tab', {
			name: 'Settings',
			exact: true,
		});
		if (await settings.isVisible()) {
			await settings.click();
		}
		await page
			.getByRole('button', { name: 'Bulk edit cells', exact: true })
			.click();
		const modal = page.getByRole('dialog', {
			name: 'Bulk edit cells',
			exact: true,
		});
		const preview = modal.locator('table');
		await expect(preview).toHaveCSS('border-collapse', 'separate');
		await expect(preview).toHaveCSS('border-spacing', '20px 10px');
		await expect(modal.locator('td[rowspan="2"][colspan="2"]')).toHaveCount(
			1
		);
		await modal
			.getByRole('button', { name: 'All cells', exact: true })
			.click();
		await expect(
			modal.locator('.modular-table-blocks-bulk-preview-selection')
		).toHaveCount(1);
		await modal.evaluate(async (node) => {
			const screen = node.closest('.components-modal__screen') ?? node;
			await Promise.all(
				screen
					.getAnimations({ subtree: true })
					.map((animation) =>
						animation.finished.catch(() => undefined)
					)
			);
		});
		await page.screenshot({
			path: test.info().outputPath('separate-merged-preview.png'),
		});
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		expect(await tree(page)).toEqual(before);
		await spacingPanel(page);
		const unlink = page.getByRole('button', {
			name: 'Unlink axes',
			exact: true,
		});
		if (await unlink.isVisible()) {
			await unlink.click();
		}
		await expect(
			page.getByRole('button', {
				name: 'Reset border layout and spacing',
				exact: true,
			})
		).toHaveCount(0);
		for (const name of ['Horizontal spacing', 'Vertical spacing']) {
			const input = page.getByRole('spinbutton', { name, exact: true });
			await input.fill('');
			await input.press('Tab');
		}
		await page
			.getByRole('radio', { name: 'Collapse borders', exact: true })
			.click();
		const reset = await tree(page);
		expect(reset.attributes.borderCollapse).toBe('collapse');
		expect(reset.attributes.styleTokens).toEqual({ borderWidth: '1px' });
		expect(reset.innerBlocks).toEqual(before.innerBlocks);
		await expect(editorGrid(page)).toHaveCSS('column-gap', '0px');
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.goto(`/?p=${id}`);
		await expect(
			page.locator('table.wp-block-modular-table-blocks-table')
		).toHaveCSS('border-collapse', 'collapse');
	});
}

test('site spacing variables are inherited by editor and preview without writing cell or table overrides', async ({
	page,
}) => {
	await spacingPanel(page);
	await page
		.getByRole('radio', { name: 'Separate borders', exact: true })
		.click();
	const frame = page
		.frames()
		.find((candidate) => candidate.name() === 'editor-canvas')!;
	await frame.addStyleTag({
		content:
			':root { --mtb-border-spacing-x: 6px; --mtb-border-spacing-y: 9px; }',
	});
	await expectEditorGaps(page, 6, 9);
	const before = await tree(page);
	expect(before.attributes.styleTokens).toEqual({ borderWidth: '1px' });
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const modal = page.getByRole('dialog', {
		name: 'Bulk edit cells',
		exact: true,
	});
	await expect(modal.locator('table')).toHaveCSS('border-spacing', '6px 9px');
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await tree(page)).toEqual(before);
	await spacingPanel(page);
	await page
		.getByRole('button', { name: 'Unlink axes', exact: true })
		.click();
	await page
		.getByRole('spinbutton', { name: 'Horizontal spacing', exact: true })
		.fill('14');
	await page
		.getByRole('spinbutton', { name: 'Horizontal spacing', exact: true })
		.press('Tab');
	await expectEditorGaps(page, 14, 9);
	await page
		.getByRole('spinbutton', { name: 'Horizontal spacing', exact: true })
		.fill('');
	await page
		.getByRole('spinbutton', { name: 'Horizontal spacing', exact: true })
		.press('Tab');
	await expectEditorGaps(page, 6, 9);
	expect((await tree(page)).attributes.styleTokens).toEqual({
		borderWidth: '1px',
	});
});
