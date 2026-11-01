import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openEditor } from './login';
import { editorCanvas } from './editor-canvas';
import {
	clearBulkSelection,
	resetBulkPanel,
	showBulkTypography,
} from './bulk-controls';
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, context }) => {
	const errors: string[] = [];
	runtimeErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [{ width: '25%' }, {}, {}, {}],
				styleTokens: { cellPaddingBlock: '11px', borderWidth: '1px' },
			},
			Array.from({ length: 3 }, (_, r) =>
				Array.from({ length: 4 }, (_cell, c) =>
					createBlock(
						'modular-table-blocks/cell',
						{
							styleTokens: {
								borderColor: c % 2 ? '#112233' : '#abcdef',
								borderStyle: c % 2 ? 'dashed' : 'solid',
								cellPaddingBlock: '0',
								cellPaddingInline: '7px',
							},
							style: {
								color: { text: '#123456' },
								typography: { textAlign: 'right' },
							},
						},
						[
							createBlock('core/paragraph', {
								content: `Cell ${r + 1}:${c + 1}`,
							}),
						]
					)
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([
			table,
			createBlock('core/paragraph', {
				content: 'Typography reference',
				style: { typography: { fontSize: '24px' } },
			}),
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Bulk cell settings' });
	});
	await expect(
		(await editorCanvas(page))
			.locator('.modular-table-blocks-editor__cell')
			.first()
	).toBeVisible();
});
test.afterEach(async ({ page }) => {
	expect(runtimeErrors.get(page)).toEqual([]);
	// WordPress persists sidebar visibility per user, including its mobile closure.
	if (await page.locator('iframe[name="editor-canvas"]').count()) {
		await page.setViewportSize({ width: 1280, height: 720 });
		if (
			!(await page.locator('.block-editor-block-inspector').isVisible())
		) {
			await page
				.getByRole('button', { name: 'Settings', exact: true })
				.click();
		}
	}
});
const source = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
const dialog = (page: Page) =>
	page.getByRole('dialog', { name: 'Bulk edit cells', exact: true });
async function open(page: Page, selectAll = true) {
	if (!(await page.locator('.block-editor-block-inspector').isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
	const blockTab = page.getByRole('tab', { name: 'Block', exact: true });
	if (await blockTab.isVisible()) {
		await blockTab.click();
	}
	const settings = page.getByRole('tab', { name: 'Settings', exact: true });
	if (await settings.isVisible()) {
		await settings.click();
	}
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	await expect(dialog(page)).toBeVisible();
	await expect(dialog(page).getByRole('status')).toHaveText(
		'0 cells selected'
	);
	if (selectAll) {
		await dialog(page)
			.getByRole('button', { name: 'All cells', exact: true })
			.click();
		await showBulkTypography(page, []);
	}
}
async function panel(page: Page, title: string) {
	const card = dialog(page).getByRole('region', { name: title, exact: true });
	await expect(card).toBeVisible();
	if (title === 'Typography') {
		await showBulkTypography(page);
	}
	return card;
}
async function expectSelectionOutline(
	page: Page,
	mode: 'all' | 'rows' | 'columns',
	runs: number[][]
) {
	await expect
		.poll(() =>
			dialog(page).evaluate(
				(modal, input) => {
					const actual = Array.from(
						modal.querySelectorAll(
							'.modular-table-blocks-bulk-preview-selection'
						)
					).map((node) => node.getBoundingClientRect());
					if (actual.length !== input.runs.length) {
						return 10000;
					}
					const columns = Array.from(
						modal.querySelectorAll(
							'.modular-table-blocks-bulk-preview-table thead th'
						)
					)
						.slice(1)
						.map((node) => node.getBoundingClientRect());
					const rows = Array.from(
						modal.querySelectorAll(
							'.modular-table-blocks-bulk-preview-table tbody tr'
						)
					).map((node) => node.getBoundingClientRect());
					return Math.max(
						0,
						...input.runs.flatMap(([first, last], index) => {
							const left =
								columns[input.mode === 'columns' ? first : 0]
									.left;
							const right =
								columns[
									input.mode === 'columns'
										? last
										: columns.length - 1
								].right;
							const top =
								rows[input.mode === 'rows' ? first : 0].top;
							const bottom =
								rows[
									input.mode === 'rows'
										? last
										: rows.length - 1
								].bottom;
							return [
								Math.abs(actual[index].left - left),
								Math.abs(actual[index].right - right),
								Math.abs(actual[index].top - top),
								Math.abs(actual[index].bottom - bottom),
							];
						})
					);
				},
				{ mode, runs }
			)
		)
		.toBeLessThanOrEqual(1.5);
}
for (const entry of ['All cells']) {
	test(`bulk selection starts empty and ${entry} toggles without discarding drafts`, async ({
		page,
	}) => {
		const before = await source(page);
		await open(page, false);
		const modal = dialog(page);
		const preview = modal.getByRole('region', {
			name: 'Cell selection',
			exact: true,
		});
		const control = modal.getByRole('button', { name: entry, exact: true });
		const outlines = modal.locator(
			'.modular-table-blocks-bulk-preview-selection'
		);
		await expect(
			preview.getByRole('button', { pressed: true })
		).toHaveCount(0);
		await expect(outlines).toHaveCount(0);
		await expect(
			modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
		).toBeDisabled();
		await expect(
			modal
				.getByRole('region', { name: 'Typography', exact: true })
				.getByRole('button', { name: 'Set custom size', exact: true })
		).toBeDisabled();
		await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
		await panel(page, 'Typography');
		const size = modal.getByRole('spinbutton', {
			name: /^(Font size|Custom)$/,
		});
		await expect(size).toBeEnabled();
		await control.focus();
		await control.press('Space');
		await expect(
			preview.getByRole('button', { pressed: true })
		).toHaveCount(8);
		await expectSelectionOutline(page, 'all', [[0, 3]]);
		await size.fill('24');
		await control.focus();
		await control.press('Enter');
		await expect(modal.getByRole('status')).toHaveText('0 cells selected');
		await expect(
			preview.getByRole('button', { pressed: true })
		).toHaveCount(0);
		await expect(outlines).toHaveCount(0);
		await expect(size).toBeDisabled();
		const apply = modal.getByRole('button', {
			name: 'Apply to 12 cells',
			exact: true,
		});
		await expect(apply).toBeEnabled();
		await expect(modal.locator('tbody td').first()).toHaveCSS(
			'font-size',
			'24px'
		);
		expect(await source(page)).toEqual(before);
		await control.click();
		await expect(size).toHaveValue('24');
		await control.click();
		await expect(modal.getByRole('status')).toHaveText('0 cells selected');
		await apply.scrollIntoViewIfNeeded();
		await apply.focus();
		await apply.click();
		await dialog(page)
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		await expect(modal).toBeHidden();
		await expect
			.poll(async () =>
				(await source(page)).innerBlocks.map(
					(cell) =>
						(
							cell.attributes.style as {
								typography?: {
									fontSize?: string;
								};
							}
						)?.typography?.fontSize
				)
			)
			.toEqual(Array(12).fill(undefined));
		expect((await source(page)).attributes.style).toMatchObject({
			typography: { fontSize: '24px' },
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		await expect.poll(() => source(page)).toEqual(before);
		// WP 6.6 clears block selection when undoing the bulk attribute update.
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(table.clientId);
		});
		await expect(
			page.locator('.block-editor-block-inspector')
		).toBeVisible();
		await open(page, false);
		await expect(
			modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
		).toBeDisabled();
		await expect(outlines).toHaveCount(0);
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
	});
}
for (const merged of [false, true]) {
	test(`logical row and column outlines join adjacent ranges with ${merged ? 'merged' : 'regular'} cells`, async ({
		page,
	}) => {
		if (merged) {
			await page.evaluate(() => {
				const table = window.wp.data
					.select('core/block-editor')
					.getBlocks()[0];
				const actions = window.wp.data.dispatch('core/block-editor');
				actions.replaceInnerBlocks(
					table.clientId,
					window.mtbMergeCells(table, 0, 0, 2, 2),
					false
				);
			});
		}
		const before = await source(page);
		await open(page);
		const modal = dialog(page);
		const preview = modal.getByRole('region', {
			name: 'Cell selection',
			exact: true,
		});
		await expectSelectionOutline(page, 'all', [[0, 3]]);
		await expect(
			preview.getByRole('button', { pressed: true })
		).toHaveCount(8);
		await modal
			.getByRole('heading', { name: 'Bulk edit cells', exact: true })
			.hover();
		const accent = await preview
			.getByRole('button', { name: 'All cells', exact: true })
			.evaluate((node) => getComputedStyle(node).backgroundColor);
		for (const button of await preview.getByRole('button').all()) {
			await expect(button).toHaveCSS('background-color', accent);
		}
		await clearBulkSelection(modal);
		await expectSelectionOutline(page, 'rows', []);
		await expect(
			preview.getByRole('button', { pressed: true })
		).toHaveCount(0);
		await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
		await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
		await expectSelectionOutline(page, 'rows', [[0, 1]]);
		await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
		await expectSelectionOutline(page, 'rows', [[1, 1]]);
		await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
		await modal.getByRole('button', { name: 'Row 3', exact: true }).click();
		await expectSelectionOutline(page, 'rows', [[0, 2]]);
		await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
		await expectSelectionOutline(page, 'rows', [
			[0, 0],
			[2, 2],
		]);
		await modal
			.getByRole('button', { name: 'Column 2', exact: true })
			.click();
		await expectSelectionOutline(page, 'columns', [[1, 1]]);
		await modal
			.getByRole('button', { name: 'Column 3', exact: true })
			.click();
		await expectSelectionOutline(page, 'columns', [[1, 2]]);
		await modal
			.getByRole('button', { name: 'Column 4', exact: true })
			.click();
		await modal
			.getByRole('button', { name: 'Column 3', exact: true })
			.click();
		await expectSelectionOutline(page, 'columns', [
			[1, 1],
			[3, 3],
		]);
		await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
		await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
		await panel(page, 'Typography');
		await modal
			.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
			.fill('64');
		await expectSelectionOutline(page, 'rows', [[0, 1]]);
		await modal
			.getByRole('button', { name: 'Column 2', exact: true })
			.click();
		await panel(page, 'Typography');
		await modal
			.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
			.fill('96');
		await expectSelectionOutline(page, 'columns', [[1, 1]]);
		await page.setViewportSize({ width: 375, height: 812 });
		await preview.focus();
		await page.keyboard.press('ArrowRight');
		await expectSelectionOutline(page, 'columns', [[1, 1]]);
		await expect(modal.locator('td[style*="outline"]')).toHaveCount(0);
		const accessibility = await new AxeBuilder({ page })
			.include('.modular-table-blocks-bulk')
			.analyze();
		expect(accessibility.violations).toEqual([]);
		await page.screenshot({
			path: test
				.info()
				.outputPath('logical-selection-outline-mobile.png'),
			fullPage: true,
		});
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		await expect.poll(() => source(page)).toEqual(before);
	});
}
test('bulk alignment matrix stages choices, resets inheritance and survives apply, undo and reload', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			style: { typography: { textAlign: 'center' } },
		});
		const first = table.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		actions.updateBlockAttributes(first.clientId, {
			style: {
				...(first.attributes.style as object),
				typography: { textAlign: 'left' },
			},
		});
	});
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await panel(page, 'Alignment');
	const matrix = modal.locator('.modular-table-blocks-alignment-matrix');
	const choices = matrix.getByRole('gridcell');
	await expect(choices).toHaveCount(9);
	await expect(
		modal
			.getByRole('region', { name: 'Alignment', exact: true })
			.locator('.components-toggle-group-control')
	).toHaveCount(0);
	await expect(matrix).toHaveClass(/--empty/);
	const center = choices.nth(1);
	const left = choices.nth(0);
	const bottom = choices.nth(7);
	const cell = (r: number, c: number) =>
		modal.getByRole('cell', {
			name: `Cell at row ${r}, column ${c}`,
			exact: true,
		});
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await center.scrollIntoViewIfNeeded();
	await page.mouse.move(0, 0);
	await center.hover();
	await center.focus();
	await expect(
		page.getByRole('tooltip', { name: /Top Center/i })
	).toBeVisible();
	await center.press('Enter');
	await bottom.click();
	await expect(cell(1, 1)).toHaveCSS('text-align', 'center');
	await expect(cell(1, 1)).toHaveCSS('vertical-align', 'bottom');
	await expect(cell(2, 1)).toHaveCSS('text-align', 'right');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await expect(matrix).toHaveClass(/--empty/);
	await left.click();
	await expect(cell(1, 2)).toHaveCSS('text-align', 'left');
	await expect(cell(2, 2)).toHaveCSS('text-align', 'left');
	await expect(cell(2, 2)).toHaveCSS('vertical-align', 'top');
	await modal.getByRole('button', { name: 'Row 3', exact: true }).click();
	await left.click();
	await left.click();
	await expect(matrix).toHaveClass(/--empty/);
	await expect(cell(3, 1)).toHaveCSS('text-align', 'center');
	await expect(cell(1, 2)).toHaveCSS('text-align', 'left');
	await page.screenshot({
		path: test.info().outputPath('bulk-alignment-controls.png'),
	});
	expect(
		(
			await new AxeBuilder({ page })
				.include('.modular-table-blocks-bulk')
				.analyze()
		).violations
	).toEqual([]);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
	await open(page);
	await panel(page, 'Alignment');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await center.click();
	await bottom.click();
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await left.click();
	const apply = modal.getByRole('button', {
		name: 'Apply to 6 cells',
		exact: true,
	});
	await apply.scrollIntoViewIfNeeded();
	await apply.focus();
	await apply.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await expect(modal).toBeHidden();
	const after = await source(page);
	expect(after.attributes).toEqual(before.attributes);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 4; c++) {
			const current = after.innerBlocks.filter(
				(candidate) => candidate.attributes.row === r
			)[c];
			if (r === 0 || c === 1) {
				expect(
					(
						current.attributes.style as {
							typography: {
								textAlign: string;
							};
						}
					).typography.textAlign
				).toBe(c === 1 ? 'left' : undefined);
				expect(current.attributes.styleTokens).toEqual(
					before.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c].attributes.styleTokens
				);
				expect(current.innerBlocks).toEqual(
					before.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c].innerBlocks
				);
			} else {
				expect(current).toEqual(
					before.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c]
				);
			}
		}
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(after);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const cells = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell');
	await expect(cells.nth(0)).toHaveCSS('text-align', 'center');
	await expect(cells.nth(1)).toHaveCSS('text-align', 'left');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const rows = page.locator(
		'table.wp-block-modular-table-blocks-table tbody tr'
	);
	await expect(rows.nth(0).locator('td').first()).toHaveCSS(
		'text-align',
		'center'
	);
	await expect(rows.nth(1).locator('td').nth(1)).toHaveCSS(
		'text-align',
		'left'
	);
});
test('bulk alignment matrix keeps mixed drafts and clears a selected position with keyboard', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await panel(page, 'Alignment');
	const matrix = modal.locator('.modular-table-blocks-alignment-matrix');
	const choices = matrix.getByRole('gridcell');
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	await expect(matrix).toHaveAttribute('aria-disabled', 'true');
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	await expect(matrix).not.toHaveAttribute('aria-disabled', 'true');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await choices.nth(3).click();
	const cell = (r: number, c: number) =>
		modal.getByRole('cell', {
			name: `Cell at row ${r}, column ${c}`,
			exact: true,
		});
	await expect(cell(1, 1)).toHaveCSS('vertical-align', 'middle');
	await expect(cell(1, 1)).toHaveCSS('text-align', 'left');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await expect(matrix).toHaveClass(/--empty/);
	await choices.nth(8).click();
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(matrix).toHaveClass(/--empty/);
	await expect(cell(1, 1)).toHaveCSS('vertical-align', 'middle');
	await expect(cell(1, 2)).toHaveCSS('vertical-align', 'bottom');
	await choices.nth(4).click();
	await choices.nth(4).press('Space');
	await expect(matrix).toHaveClass(/--empty/);
	await expect(cell(1, 1)).toHaveCSS('vertical-align', 'top');
	await expect(cell(1, 1)).not.toHaveCSS('text-align', 'center');
	expect(await source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
});
test('bulk border defaults select solid while width-only drafts preserve inherited styles', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const editor = window.wp.data.dispatch('core/block-editor');
		for (const block of [table, ...table.innerBlocks]) {
			editor.updateBlockAttributes(block.clientId, {
				styleTokens: undefined,
			});
		}
	});
	const before = await source(page);
	await open(page);
	await panel(page, 'Border');
	const modal = dialog(page);
	const picker = modal.getByRole('button', {
		name: 'Border color and style picker.',
		exact: true,
	});
	await picker.click();
	await expect(
		page.getByRole('button', { name: 'Solid', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				styleTokens: { borderStyle: 'dashed' },
			});
	});
	await open(page);
	await panel(page, 'Border');
	await picker.click();
	await expect(
		page.getByRole('button', { name: 'Dashed', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	const width = modal.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('3');
	await width.press('Tab');
	const previewCell = modal
		.locator('td.modular-table-blocks-bulk-preview-cell')
		.first();
	await expect(previewCell).toHaveCSS('border-top-style', 'dashed');
	await expect(previewCell).toHaveCSS('border-top-width', '3px');
	await modal
		.getByRole('button', { name: 'Apply to 12 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect((await source(page)).attributes.styleTokens).toEqual({
		borderStyle: 'dashed',
		borderTopWidth: '3px',
		borderRightWidth: '3px',
		borderBottomWidth: '3px',
		borderLeftWidth: '3px',
	});
	for (const cell of (await source(page)).innerBlocks) {
		expect(cell.attributes.styleTokens).toBeUndefined();
	}
});
test('editor UI and iframe styles use the same build version as the script', async ({
	page,
}) => {
	const script = new URL(
		(await page.locator('script#mtb-editor-js').getAttribute('src'))!,
		page.url()
	);
	const editorStyle = page.locator(
		'link[href*="/modular-table-blocks/build/index.css"]'
	);
	await expect(editorStyle).toHaveCount(1);
	const style = new URL(
		(await editorStyle.getAttribute('href'))!,
		page.url()
	);
	expect(style.searchParams.get('ver')).toBe(script.searchParams.get('ver'));
	await expect(
		page
			.frameLocator('iframe[name="editor-canvas"]')
			.locator(`link[href="${style.href}"]`)
	).toHaveCount(1);
});
for (const location of ['inspector', 'dialog'] as const) {
	test(`directional border controls align with their edges in the ${location}`, async ({
		page,
	}) => {
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const actions = window.wp.data.dispatch('core/block-editor');
			const widths = {
				borderTopWidth: '1px',
				borderRightWidth: '2px',
				borderBottomWidth: '3px',
				borderLeftWidth: '4px',
			};
			for (const block of [table, ...table.innerBlocks]) {
				actions.updateBlockAttributes(block.clientId, {
					styleTokens: {
						...(block.attributes.styleTokens as Record<
							string,
							string
						>),
						...widths,
					},
				});
			}
		});
		const before = await source(page);
		await open(page);
		if (location === 'dialog') {
			await panel(page, 'Border');
		} else {
			await dialog(page).press('Escape');
			await expect(dialog(page)).toBeHidden();
			await expect(
				page.getByRole('button', {
					name: 'Bulk edit cells',
					exact: true,
				})
			).toBeFocused();
			await page.evaluate(() => {
				const table = window.wp.data
					.select('core/block-editor')
					.getBlocks()[0];
				window.wp.data
					.dispatch('core/block-editor')
					.selectBlock(table.innerBlocks[0].clientId);
			});
			await page
				.getByRole('tab', { name: 'Styles', exact: true })
				.click();
		}
		const container =
			location === 'dialog'
				? dialog(page)
				: page.locator('.modular-table-blocks-border-control');
		const top = container.getByRole('group', {
			name: 'Top border',
			exact: true,
		});
		await expect(top).toBeVisible();
		for (const width of location === 'dialog' ? [1280, 375] : [1280]) {
			await page.setViewportSize({ width, height: 720 });
			await top.locator('..').screenshot({
				path: test
					.info()
					.outputPath(`directional-borders-${width}.png`),
			});
			const offsets = await top.evaluate((node) => {
				const grid = node.parentElement!;
				const box = grid.getBoundingClientRect();
				return Array.from(
					grid.querySelectorAll(':scope > fieldset')
				).map((control) => {
					const rect = control
						.querySelector('.components-input-control')!
						.getBoundingClientRect();
					return {
						center: Math.abs(
							rect.x + rect.width / 2 - box.x - box.width / 2
						),
						left: rect.left - box.left,
						right: box.right - rect.right,
					};
				});
			});
			expect(offsets).toHaveLength(4);
			expect(offsets[0].center).toBeLessThanOrEqual(2);
			expect(offsets[3].center).toBeLessThanOrEqual(2);
			expect(Math.abs(offsets[1].left)).toBeLessThanOrEqual(2);
			expect(Math.abs(offsets[2].right)).toBeLessThanOrEqual(2);
		}
		expect(await source(page)).toEqual(before);
		if (location === 'dialog') {
			await dialog(page).press('Escape');
		}
	});
}
for (const [name, widths] of [
	['percentages', ['25%', '25%', '25%', '25%']],
	['pixels', ['180px', '180px', '180px', '180px']],
	['mixed units', ['25%', '10rem', '25%', '180px']],
] as const) {
	test(`row selectors reserve space with all column widths set in ${name}`, async ({
		page,
	}) => {
		await page.evaluate(
			(values) => {
				const table = window.wp.data
					.select('core/block-editor')
					.getBlocks()[0];
				window.wp.data
					.dispatch('core/block-editor')
					.updateBlockAttributes(table.clientId, {
						columns: values.map((width) => ({ width })),
					});
			},
			[...widths]
		);
		const before = await source(page);
		await open(page);
		const modal = dialog(page);
		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 720 });
			const geometry = await modal
				.locator('tbody > tr')
				.first()
				.evaluate((row) => {
					const axis = row
						.querySelector('th')!
						.getBoundingClientRect();
					const button = row
						.querySelector('th button')!
						.getBoundingClientRect();
					const firstCell = row
						.querySelector('td')!
						.getBoundingClientRect();
					return {
						axisWidth: axis.width,
						buttonWidth: button.width,
						gap: firstCell.left - axis.right,
					};
				});
			expect(geometry.axisWidth).toBeGreaterThanOrEqual(40);
			expect(
				Math.abs(geometry.buttonWidth - geometry.axisWidth)
			).toBeLessThanOrEqual(2);
			expect(geometry.gap).toBeGreaterThanOrEqual(-1);
			await modal
				.getByRole('button', { name: 'Row 1', exact: true })
				.click();
			await expect(
				modal.getByRole('button', { name: 'Row 1', exact: true })
			).toHaveAttribute(
				'aria-pressed',
				width === 1280 ? 'true' : 'false'
			);
		}
		await page.screenshot({
			path: test.info().outputPath('all-column-widths.png'),
		});
		await modal.press('Escape');
		expect(await source(page)).toEqual(before);
	});
}
for (const [name, mode, count, padding] of [
	['many equal columns', 'equal', 20, '7px'],
	['many automatic columns', 'auto', 20, '7px'],
	['wide custom columns', 'custom', 4, '7px'],
	['large cell padding', 'equal', 4, '150px'],
] as const) {
	test(`bulk preview scrolls horizontally for ${name} without moving selectors or selection outlines`, async ({
		page,
	}) => {
		await page.evaluate(
			({ widthMode, columns, inset }) => {
				const { createBlock } = window.wp.blocks;
				const table = window.mtbCreateTable(
					{
						columns: Array.from({ length: columns }, () =>
							widthMode === 'custom' ? { width: '300px' } : {}
						),
						columnWidthMode: widthMode,
						responsiveMode: 'none',
						borderCollapse:
							widthMode === 'custom' ? 'separate' : 'collapse',
						styleTokens: {
							cellPaddingInline: inset,
							borderSpacingHorizontal: '8px',
						},
					},
					Array.from({ length: 3 }, () =>
						Array.from({ length: columns }, () =>
							createBlock('modular-table-blocks/cell', {}, [
								createBlock('modular-table-blocks/cell-text'),
							])
						)
					)
				);
				table.innerBlocks = window.mtbMergeCells(table, 0, 0, 2, 2);
				window.wp.data
					.dispatch('core/block-editor')
					.resetBlocks([table]);
				window.wp.data
					.dispatch('core/block-editor')
					.selectBlock(table.clientId);
			},
			{ widthMode: mode, columns: count, inset: padding }
		);
		const before = await source(page);
		await open(page, false);
		const modal = dialog(page);
		const preview = modal.getByRole('region', {
			name: 'Cell selection',
			exact: true,
		});
		const status = modal.locator(
			'.modular-table-blocks-bulk-selection-status'
		);
		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 720 });
			await modal.evaluate(async (node) => {
				for (
					let element: Element | null = node;
					element;
					element = element.parentElement
				) {
					await Promise.all(
						element
							.getAnimations()
							.map((animation) =>
								animation.finished.catch(() => undefined)
							)
					);
				}
			});
			await expect
				.poll(() =>
					preview.evaluate(
						(node) => node.scrollWidth - node.clientWidth
					)
				)
				.toBeGreaterThan(20);
			await expect
				.poll(() =>
					modal
						.locator('.modular-table-blocks-bulk-layout')
						.evaluate(
							(node) => node.scrollWidth <= node.clientWidth + 1
						)
				)
				.toBe(true);
			await preview.focus();
			const footer = (await status.boundingBox())!;
			await preview.press('ArrowRight', { delay: 100 });
			await expect
				.poll(() => preview.evaluate((node) => node.scrollLeft))
				.toBeGreaterThan(0);
			const afterScroll = (await status.boundingBox())!;
			expect(afterScroll.x).toBeCloseTo(footer.x, 0);
			expect(afterScroll.y).toBeCloseTo(footer.y, 0);
			await modal
				.getByRole('button', { name: `Column ${count}`, exact: true })
				.click();
			await modal
				.getByRole('button', {
					name: `Column ${count - 1}`,
					exact: true,
				})
				.click();
			await expectSelectionOutline(page, 'columns', [
				[count - 2, count - 1],
			]);
			const row = modal.getByRole('button', {
				name: 'Row 3',
				exact: true,
			});
			await expect
				.poll(() =>
					row.evaluate((button) => {
						const viewport = button.closest(
							'.modular-table-blocks-bulk__preview'
						)!;
						return Math.abs(
							button.getBoundingClientRect().left -
								viewport.getBoundingClientRect().left -
								1
						);
					})
				)
				.toBeLessThan(2);
			await row.click();
			await expectSelectionOutline(page, 'rows', [[2, 2]]);
			await expect(status).toBeInViewport({ ratio: 1 });
		}
		await modal.screenshot({
			path: test.info().outputPath('bulk-horizontal-scroll.png'),
		});
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		expect(await source(page)).toEqual(before);
	});
}

test('bulk preview only overflows when draft typography needs more width and shrinks back after reset', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: Array.from({ length: 12 }, () => ({})),
				responsiveMode: 'none',
			},
			[
				Array.from({ length: 12 }, () =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('modular-table-blocks/cell-text'),
					])
				),
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	const preview = modal.getByRole('region', {
		name: 'Cell selection',
		exact: true,
	});
	await expect
		.poll(() =>
			preview.evaluate((node) => node.scrollWidth - node.clientWidth)
		)
		.toBeLessThanOrEqual(1);
	await panel(page, 'Typography');
	const size = modal.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('160');
	await size.press('Tab');
	await expect
		.poll(() =>
			preview.evaluate((node) => node.scrollWidth - node.clientWidth)
		)
		.toBeGreaterThan(20);
	await expectSelectionOutline(page, 'all', [[0, 11]]);
	await size.fill('16');
	await size.press('Tab');
	await expect
		.poll(() =>
			preview.evaluate((node) => node.scrollWidth - node.clientWidth)
		)
		.toBeLessThanOrEqual(1);
	await expectSelectionOutline(page, 'all', [[0, 11]]);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
});

test('selection uses the WordPress button accent and updates with its color context', async ({
	page,
}) => {
	await open(page);
	const modal = dialog(page);
	const reference = modal
		.getByRole('button', {
			name: 'Close',
			exact: true,
		})
		.last();
	const all = modal.getByRole('button', { name: 'All cells', exact: true });
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('24');
	const primary = modal.getByRole('button', {
		name: 'Apply to 12 cells',
		exact: true,
	});
	for (const [color, rgb, hover] of [
		['#2271b1', 'rgb(34, 113, 177)', '#135e96'],
		['#8c174c', 'rgb(140, 23, 76)', '#651136'],
	]) {
		await clearBulkSelection(modal);
		await page.addStyleTag({
			content: `.modular-table-blocks-bulk { --wp-components-color-accent: ${color}; --wp-components-color-accent-darker-10: ${hover}; --wp-admin-theme-color: ${color}; }`,
		});
		await modal
			.getByRole('heading', { name: 'Bulk edit cells', exact: true })
			.hover();
		await all.click();
		await modal
			.getByRole('heading', { name: 'Bulk edit cells', exact: true })
			.hover();
		await expect(reference).toHaveCSS('color', rgb);
		const accent = await reference.evaluate(
			(node) => getComputedStyle(node).color
		);
		await expect(all).toHaveCSS('background-color', accent);
		await expect(
			modal.locator('.modular-table-blocks-bulk-preview-selection')
		).toHaveCSS('border-top-color', accent);
		await primary.hover();
		const hovered = await primary.evaluate(
			(node) => getComputedStyle(node).backgroundColor
		);
		await all.hover();
		await expect(all).toHaveCSS('background-color', hovered);
		for (const label of ['Row 1', 'Column 2']) {
			const button = modal.getByRole('button', {
				name: label,
				exact: true,
			});
			await button.click();
			await modal
				.getByRole('heading', { name: 'Bulk edit cells', exact: true })
				.hover();
			await expect(button).toHaveCSS('background-color', accent);
			await expect(all).toHaveAttribute('aria-pressed', 'false');
		}
	}
	await modal.press('Escape');
});
for (const merged of [false, true]) {
	test(`row selection fills tall preview rows with ${merged ? 'merged' : 'regular'} cells`, async ({
		page,
	}) => {
		await page.evaluate((withMerge) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const actions = window.wp.data.dispatch('core/block-editor');
			const tall = table.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[2];
			actions.updateBlockAttributes(tall.clientId, {
				styleTokens: {
					...(tall.attributes.styleTokens as Record<string, string>),
					cellPaddingTop: '60px',
					cellPaddingBottom: '60px',
				},
			});
			if (withMerge) {
				actions.replaceInnerBlocks(
					table.clientId,
					window.mtbMergeCells(
						window.wp.data
							.select('core/block-editor')
							.getBlocks()[0],
						0,
						0,
						2,
						1
					),
					false
				);
			}
		}, merged);
		const before = await source(page);
		await open(page);
		const modal = dialog(page);
		const rows = modal.locator('tbody > tr');
		const button = modal.getByRole('button', {
			name: 'Row 1',
			exact: true,
		});
		const aligned = async () => {
			// Measure each pair in one frame, including during the WP 6.6 modal animation.
			const differences = await rows.evaluateAll((nodes) =>
				nodes.map((node) => {
					const row = node.getBoundingClientRect();
					const target = node
						.querySelector('th button')!
						.getBoundingClientRect();
					return Math.max(
						Math.abs(target.y - row.y),
						Math.abs(target.height - row.height)
					);
				})
			);
			expect(differences).toHaveLength(3);
			expect(Math.max(...differences)).toBeLessThanOrEqual(2);
		};
		const tallHeight = (await rows.first().boundingBox())!.height;
		expect(tallHeight).toBeGreaterThan(120);
		await aligned();
		const target = (await button.boundingBox())!;
		await button.click({
			position: { x: target.width / 2, y: target.height - 8 },
		});
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(modal.getByRole('status')).toHaveText(
			'4 cells selected (1)'
		);
		await panel(page, 'Padding');
		await resetBulkPanel(page, 'Padding');
		await expect
			.poll(async () => (await rows.first().boundingBox())!.height)
			.toBeLessThan(tallHeight);
		await aligned();
		await panel(page, 'Typography');
		await modal
			.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
			.fill('64');
		await expect(modal.locator('td').first()).toHaveCSS(
			'font-size',
			'64px'
		);
		await aligned();
		await button.focus();
		await page.keyboard.press('Space');
		await expect(button).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('Space');
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(button).toBeFocused();
		await page.screenshot({
			path: test.info().outputPath('tall-row-selection.png'),
		});
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		expect(await source(page)).toEqual(before);
	});
}
test('non-contiguous rows apply only changed native fields in one undo and survive save/reload', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await modal.getByRole('button', { name: 'Row 3', exact: true }).click();
	await expect(modal.getByRole('status')).toHaveText(
		'8 cells selected (1, 3)'
	);
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('24');
	await expect(
		modal.locator('td[aria-label="Cell at row 1, column 1"]')
	).toHaveCSS('font-size', '24px');

	await expect.poll(() => source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Apply to 8 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const after = await source(page);
	for (const r of [0, 2]) {
		for (let c = 0; c < 4; c++) {
			expect(
				after.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].attributes.style
			).toEqual({
				color: { text: '#123456' },
				typography: { textAlign: 'right', fontSize: '24px' },
			});
			expect(
				after.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].innerBlocks
			).toEqual(
				before.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].innerBlocks
			);
			expect(
				after.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].attributes.styleTokens
			).toEqual(
				before.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].attributes.styleTokens
			);
		}
	}
	expect(after.innerBlocks.filter((c) => c.attributes.row === 1)).toEqual(
		before.innerBlocks.filter((c) => c.attributes.row === 1)
	);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(after);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect
		.poll(
			async () =>
				(await source(page))?.innerBlocks?.find(
					(c) => c.attributes.row === 2
				)?.attributes.style
		)
		.toEqual({
			color: { text: '#123456' },
			typography: { textAlign: 'right', fontSize: '24px' },
		});
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${postId}`);
	await expect(
		page
			.locator('table.wp-block-modular-table-blocks-table tr')
			.last()
			.locator('td')
			.first()
	).toHaveCSS(
		'font-size',
		await page
			.getByText('Typography reference', { exact: true })
			.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await expect(
		page.locator(
			'table.wp-block-modular-table-blocks-table .block-editor-inner-blocks'
		)
	).toHaveCount(0);
});
test('column selection preserves widths and mixed border styles, with four-side padding reset', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await modal.getByRole('button', { name: 'Column 1', exact: true }).click();
	await modal.getByRole('button', { name: 'Column 4', exact: true }).click();
	await expect(modal.getByRole('status')).toHaveText(
		'6 cells selected (1, 4)'
	);
	await panel(page, 'Border');

	await modal
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.fill('3');
	const previewCell = modal.locator(
		'td[aria-label="Cell at row 1, column 1"]'
	);
	await expect(previewCell).toHaveCSS('border-top-width', '3px');
	await expect(previewCell).toHaveCSS(
		'border-top-color',
		'rgb(171, 205, 239)'
	);
	await expect(previewCell).toHaveCSS('border-top-style', 'solid');
	await expect(
		modal.locator('td[aria-label="Cell at row 1, column 4"]')
	).toHaveCSS('border-top-style', 'dashed');
	await panel(page, 'Padding');
	await resetBulkPanel(page, 'Padding');
	await expect(previewCell).toHaveCSS('padding-top', '11px');
	await expect(
		modal.getByRole('region', { name: 'Column width', exact: true })
	).toHaveCount(0);
	await modal
		.getByRole('button', { name: 'Apply to 6 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const after = await source(page);
	expect(after.attributes.columns).toEqual(before.attributes.columns);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 4; c++) {
			if (c === 1 || c === 2) {
				expect(
					after.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c]
				).toEqual(
					before.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c]
				);
				continue;
			}
			expect(
				after.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].attributes.styleTokens
			).toEqual({
				borderColor: c % 2 ? '#112233' : '#abcdef',
				borderStyle: c % 2 ? 'dashed' : 'solid',
				borderTopWidth: '3px',
				borderRightWidth: '3px',
				borderBottomWidth: '3px',
				borderLeftWidth: '3px',
			});
		}
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
});
for (const axis of ['Row', 'Column'] as const) {
	test(`merged ${axis.toLowerCase()} selection changes only complete edges inside the range`, async ({
		page,
	}) => {
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const actions = window.wp.data.dispatch('core/block-editor');
			actions.updateBlockAttributes(table.clientId, {
				styleTokens: {
					cellPaddingBlock: '11px',
					cellPaddingInline: '19px',
					borderWidth: '1px',
				},
			});
			actions.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 0, 2, 2),
				false
			);
			const reference = window.wp.data
				.select('core/block-editor')
				.getBlocks()[1];
			actions.updateBlockAttributes(reference.clientId, {
				style: { typography: { fontSize: '20px', lineHeight: '1.8' } },
			});
		});
		const before = await source(page);
		await open(page);
		const modal = dialog(page);
		const side = axis === 'Row' ? 'bottom' : 'right';
		const count = axis === 'Row' ? 3 : 2;
		await modal
			.getByRole('button', { name: `${axis} 2`, exact: true })
			.click();
		const merged = modal.locator('td[rowspan="2"][colspan="2"]');
		await expect(
			modal.locator('.modular-table-blocks-bulk-preview-selection')
		).toHaveCount(1);
		await panel(page, 'Border');
		const link = modal
			.getByRole('region', { name: 'Border', exact: true })
			.getByRole('button', {
				name: 'Link sides',
				exact: true,
			});
		if (await link.isVisible()) {
			await link.click();
		}
		await modal
			.getByRole('spinbutton', { name: 'Border width', exact: true })
			.fill('3');
		await expect(merged).toHaveCSS(`border-${side}-width`, '3px');
		await expect(merged).toHaveCSS('border-top-width', '1px');
		await panel(page, 'Padding');
		await resetBulkPanel(page, 'Padding');
		await expect(merged).toHaveCSS(
			`padding-${side}`,
			axis === 'Row' ? '11px' : '19px'
		);
		await expect(merged).toHaveCSS('padding-top', '0px');
		await expect(merged).toHaveCSS('padding-left', '7px');
		await panel(page, 'Cell background');
		await modal
			.locator('.modular-table-blocks-color-control')
			.getByRole('button', { name: 'Cell background', exact: true })
			.click();
		await modal
			.getByRole('option', { name: /^(?:Color: )?Contrast$/ })
			.click();
		await page.keyboard.press('Escape');
		const selectedColor = await modal
			.locator(
				'.modular-table-blocks-bulk-card[aria-label="Cell background"] .component-color-indicator'
			)
			.evaluate((node) => getComputedStyle(node).backgroundColor);
		await expect(merged).toHaveCSS('background-color', selectedColor);
		await panel(page, 'Typography');
		await modal
			.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
			.fill('20');
		await expect(merged).toHaveCSS('font-size', '20px');
		const lineHeight = modal.getByRole('spinbutton', {
			name: 'Line height',
			exact: true,
		});
		await lineHeight.fill('1.8');
		await lineHeight.press('Tab');
		await expect(merged).toHaveCSS('line-height', '36px');
		await panel(page, 'Alignment');
		await modal
			.locator('.modular-table-blocks-alignment-matrix')
			.getByRole('gridcell')
			.nth(6)
			.click();
		await expect(merged).toHaveCSS('vertical-align', 'bottom');
		await expect(merged).toHaveCSS('text-align', 'left');
		await expect(merged).toHaveCSS('font-size', '20px');
		await expect(merged).toHaveCSS('line-height', '36px');
		// Switching the selection must keep earlier drafts without expanding them.
		await modal
			.getByRole('button', { name: 'All cells', exact: true })
			.click();
		await expect(merged).toHaveCSS('font-size', '20px');
		await expect(merged).toHaveCSS('line-height', '36px');
		await modal
			.getByRole('button', { name: `${axis} 2`, exact: true })
			.click();
		await expect(merged).toHaveCSS('font-size', '20px');
		await expect(merged).toHaveCSS('line-height', '36px');
		await expect(merged).toHaveCSS('padding-left', '7px');
		expect(await source(page)).toEqual(before);
		await page.screenshot({
			path: test
				.info()
				.outputPath(`bounded-${axis.toLowerCase()}-selection.png`),
			fullPage: true,
		});
		const applyButton = modal.getByRole('button', {
			name: `Apply to ${count} cells`,
			exact: true,
		});
		// Settle the modal scroll/focus before WebKit sends the pointer click.
		await applyButton.scrollIntoViewIfNeeded();
		await applyButton.focus();
		await applyButton.click();
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		await expect(modal).toBeHidden();
		await expect
			.poll(
				async () =>
					(await source(page)).innerBlocks.filter(
						(candidate) => candidate.attributes.row === 0
					)[0].attributes.style
			)
			.toMatchObject({
				typography: { fontSize: '20px', lineHeight: '1.8' },
			});
		const after = await source(page);
		const cell = after.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0];
		expect(cell.innerBlocks).toEqual(
			before.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks
		);
		expect(cell.attributes.style).toMatchObject({
			color: { text: '#123456' },
			typography: {
				textAlign: 'left',
				fontSize: '20px',
				lineHeight: '1.8',
			},
		});
		expect(cell.attributes.verticalAlign).toBe('bottom');
		expect(cell.attributes.styleTokens).toMatchObject({
			[axis === 'Row' ? 'borderBottomWidth' : 'borderRightWidth']: '3px',
			cellPaddingTop: '0',
			cellPaddingLeft: '7px',
			cellBackgroundColor: 'var(--wp--preset--color--contrast)',
		});
		expect(cell.attributes.styleTokens).not.toHaveProperty(
			'borderTopWidth'
		);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		await expect.poll(() => source(page)).toEqual(before);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').redo()
		);
		await expect.poll(() => source(page)).toEqual(after);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		await page.reload();
		const editorCell = page
			.frameLocator('iframe[name="editor-canvas"]')
			.locator('.modular-table-blocks-editor__cell')
			.first();
		await expect(editorCell).toHaveCSS(
			`padding-${side}`,
			axis === 'Row' ? '11px' : '19px'
		);
		await expect(editorCell).toHaveCSS('padding-left', '7px');
		await expect
			.poll(
				async () =>
					(await source(page)).innerBlocks.filter(
						(candidate) => candidate.attributes.row === 0
					)[0].attributes.style
			)
			.toMatchObject({
				typography: { fontSize: '20px', lineHeight: '1.8' },
			});
		// WordPress may fluidize custom sizes; compare the standard block with identical settings.
		const editorReference = page
			.frameLocator('iframe[name="editor-canvas"]')
			.getByText('Typography reference', { exact: true });
		for (const property of ['font-size', 'line-height']) {
			await expect(editorCell).toHaveCSS(
				property,
				await editorReference.evaluate(
					(node, name) =>
						getComputedStyle(node).getPropertyValue(name),
					property
				)
			);
		}
		await expect(editorCell).toHaveCSS('align-content', 'end');
		await expect(editorCell).toHaveCSS('background-color', selectedColor);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.goto(`/?p=${id}`);
		const publicCell = page.locator(
			'table.wp-block-modular-table-blocks-table td[rowspan="2"][colspan="2"]'
		);
		await expect(publicCell).toHaveCSS(
			`padding-${side}`,
			axis === 'Row' ? '11px' : '19px'
		);
		await expect(publicCell).toHaveCSS('padding-top', '0px');
		await expect(publicCell).toHaveCSS('padding-left', '7px');
		await expect(publicCell).toHaveCSS('border-top-width', '1px');
		await expect(publicCell).toHaveCSS(`border-${side}-width`, '3px');
		for (const property of ['font-size', 'line-height']) {
			await expect(publicCell).toHaveCSS(
				property,
				await page
					.getByText('Typography reference', { exact: true })
					.evaluate(
						(node, name) =>
							getComputedStyle(node).getPropertyValue(name),
						property
					)
			);
		}
		await expect(publicCell).toHaveCSS('vertical-align', 'bottom');
		await expect(publicCell).toHaveCSS('background-color', selectedColor);
	});
}
test('interior merged selection disables unavailable edges and keeps drafts outside later selections', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 0, 3, 4),
				false
			);
	});
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	const merged = modal.locator('td');
	await expect(
		modal.locator('.modular-table-blocks-bulk-preview-selection')
	).toHaveCount(1);
	await panel(page, 'Cell background');
	await expect(
		modal.locator('.modular-table-blocks-color-control button').first()
	).toBeEnabled();
	await panel(page, 'Typography');
	await expect(
		modal.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
	).toBeEnabled();
	await panel(page, 'Border');
	const width = modal
		.getByRole('spinbutton', {
			name: 'Border width',
			exact: true,
		})
		.first();
	await expect(width).toBeDisabled();
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	await modal.getByRole('button', { name: 'Column 4', exact: true }).click();
	const link = modal
		.getByRole('region', { name: 'Border', exact: true })
		.getByRole('button', { name: 'Link sides', exact: true });
	if (await link.isVisible()) {
		await link.click();
	}
	await expect(width).toBeEnabled();
	await width.fill('4');
	await expect(merged).toHaveCSS('border-right-width', '4px');
	await expect(merged).toHaveCSS('border-top-width', '1px');
	await modal.getByRole('button', { name: 'Column 4', exact: true }).click();
	await expect(width).toBeDisabled();
	await expect(merged).toHaveCSS('border-right-width', '4px');
	await expect(
		modal.getByRole('button', { name: 'Apply to 1 cells', exact: true })
	).toBeEnabled();
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(modal).toBeVisible();
	const accessibility = await new AxeBuilder({ page })
		.include('.modular-table-blocks-bulk')
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await page.screenshot({
		path: test.info().outputPath('bounded-interior-mobile.png'),
		fullPage: true,
	});
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await expect.poll(() => source(page)).toEqual(before);
});
test('merged preview warns about crossing cells and stale structure blocks apply', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 0, 2, 2),
				false
			);
	});
	await open(page);
	const modal = dialog(page);
	await expect(modal.locator('td[rowspan="2"][colspan="2"]')).toHaveCount(1);
	await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
	await expect(modal.getByRole('status')).toHaveText('3 cells selected (2)');
	await expect(modal).toContainText(
		'Only complete cell edges inside the selected rows or columns can change.'
	);
	await expect(
		modal.locator('.modular-table-blocks-bulk-preview-selection')
	).toHaveCount(1);
	await page.screenshot({
		path: test.info().outputPath('bulk-merged-preview.png'),
	});
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('20');
	const beforeApply = await source(page);
	await modal
		.getByRole('button', { name: 'Apply to 3 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const changed = await source(page);
	expect(
		changed.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.style
	).toMatchObject({ typography: { fontSize: '20px' } });
	expect(
		changed.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 1
		)[0].attributes.style
	).toMatchObject({ typography: { fontSize: '20px' } });
	expect(changed.innerBlocks[2]).toEqual(beforeApply.innerBlocks[2]);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(beforeApply);
	await open(page);
	await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('20');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				columns: [{ width: '20%' }, {}, {}, {}],
			});
	});
	await expect(modal).toContainText('The table structure changed.');
	await expect(
		modal.getByRole('button', { name: 'Apply to 3 cells' })
	).toBeDisabled();
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await expect(
		page.getByRole('button', { name: 'Bulk edit cells', exact: true })
	).toBeFocused();
});
test('keyboard selection, cancellation, clearing and narrow modal are accessible', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	const row = modal.getByRole('button', { name: 'Row 1', exact: true });
	await row.focus();
	await row.press('Space');
	await expect(row).toHaveAttribute('aria-pressed', 'true');
	await panel(page, 'Padding');
	await panel(page, 'Border');
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(modal).toBeVisible();
	expect(
		await modal.evaluate((node) => node.getBoundingClientRect().width)
	).toBeLessThanOrEqual(375);
	const accessibility = await new AxeBuilder({ page })
		.include('.modular-table-blocks-bulk')
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await page.screenshot({ path: test.info().outputPath('bulk-narrow.png') });
	await clearBulkSelection(modal);
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells' })
	).toBeDisabled();
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	await expect(modal.getByRole('status')).toHaveText('12 cells selected');
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('30');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(
		modal.getByRole('button', { name: 'Apply to 12 cells' })
	).toBeEnabled();
	await modal.press('Escape');
	await expect(modal).toHaveCount(0);
	await expect(
		page
			.frameLocator('iframe[name="editor-canvas"]')
			.locator('.modular-table-blocks-editor')
	).toBeFocused();
	expect(await source(page)).toEqual(before);
});
test('all-cell background uses the current theme palette and explicit resets restore inheritance', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		table.innerBlocks.forEach((cell, index) => {
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(cell.clientId, {
					styleTokens: {
						...(cell.attributes.styleTokens as Record<
							string,
							string
						>),
						cellBackgroundColor: index % 2 ? '#abcdef' : '#fedcba',
					},
				});
		});
	});
	const before = await source(page);
	await page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('body')
		.evaluate((body) => {
			body.style.setProperty(
				'--wp--preset--color--bulk-accent',
				'rgb(12, 34, 56)'
			);
		});
	await open(page);
	const modal = dialog(page);
	await panel(page, 'Cell background');
	const clearColor = async () => {
		const toggle = modal
			.getByRole('button', { name: 'Cell background', exact: true })
			.last();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await toggle.click();
		await expect(
			page.getByRole('button', { name: 'Clear', exact: true })
		).toBeEnabled();
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		await page.keyboard.press('Escape');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	};
	await clearColor();
	await expect(
		modal.getByRole('button', { name: 'Apply to 12 cells', exact: true })
	).toBeEnabled();
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await open(page);
	await panel(page, 'Cell background');
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	// Install the test palette after the editor and modal have initialized.
	await page.evaluate(() => {
		const settings = window.wp.data
			.select('core/block-editor')
			.getSettings();
		const features = settings.__experimentalFeatures as Record<
			string,
			unknown
		>;
		window.wp.data.dispatch('core/block-editor').updateSettings({
			...settings,
			__experimentalFeatures: {
				...features,
				color: {
					custom: false,
					defaultPalette: false,
					palette: {
						theme: [
							{
								name: 'Bulk Theme Accent',
								slug: 'bulk-accent',
								color: 'rgb(12, 34, 56)',
							},
						],
					},
				},
			},
		});
	});
	await expect(
		modal
			.getByRole('button', { name: 'Cell background', exact: true })
			.last()
	).toHaveAttribute('aria-expanded', 'false');
	await modal
		.getByRole('button', { name: 'Cell background', exact: true })
		.last()
		.click();
	await expect(
		modal
			.getByRole('button', { name: 'Cell background', exact: true })
			.last()
	).toHaveAttribute('aria-expanded', 'true');
	await page
		.getByRole('option', { name: /^(?:Color: )?Bulk Theme Accent$/ })
		.click();
	await page.keyboard.press('Escape');
	await expect(modal).toBeVisible();
	await expect(modal.locator('td').first()).toHaveCSS(
		'background-color',
		'rgb(12, 34, 56)'
	);
	await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
	await expect(modal.locator('td').first()).toHaveCSS(
		'background-color',
		'rgb(12, 34, 56)'
	);
	expect(await source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Apply to 12 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect((await source(page)).attributes.styleTokens).toMatchObject({
		cellBackgroundColor: 'var(--wp--preset--color--bulk-accent)',
	});
	for (const cell of (await source(page)).innerBlocks) {
		expect(
			(cell.attributes.styleTokens as Record<string, string>)
				.cellBackgroundColor
		).toBeUndefined();
	}
	await open(page);
	await panel(page, 'Cell background');
	await expect(modal.locator('details')).toHaveCount(0);
	await clearColor();
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await open(page);
	await panel(page, 'Cell background');
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	await resetBulkPanel(page, 'Cell background');
	await modal
		.getByRole('button', { name: 'Apply to 12 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const inherited = structuredClone(before);
	for (const cell of inherited.innerBlocks) {
		delete (cell.attributes.styleTokens as Record<string, string>)
			.cellBackgroundColor;
	}
	expect(await source(page)).toEqual(inherited);
});
test('header selection is exclusive and edits from multiple scopes are applied together in one undo', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	await expect(
		modal.getByRole('group', { name: 'Selection mode' })
	).toHaveCount(0);
	await expect(
		modal
			.locator('.modular-table-blocks-bulk__actions')
			.first()
			.getByRole('button')
	).toHaveCount(2);
	const corner = modal.getByRole('button', {
		name: 'All cells',
		exact: true,
	});
	await expect(corner).toHaveAttribute('aria-pressed', 'true');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await modal.getByRole('button', { name: 'Row 3', exact: true }).click();
	await expect(corner).toHaveAttribute('aria-pressed', 'false');
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('18');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await expect(
		modal.getByRole('button', { name: 'Row 1', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(modal.getByRole('status')).toHaveText('3 cells selected (2)');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('24');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(
		modal.getByRole('button', { name: 'Column 2', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(
		modal.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
	).toHaveValue('');
	await expect(
		modal.locator('td[aria-label="Cell at row 1, column 1"]')
	).toHaveCSS('font-size', '18px');
	await expect(
		modal.locator('td[aria-label="Cell at row 1, column 2"]')
	).toHaveCSS('font-size', '24px');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await expect(
		modal.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
	).toHaveValue('24');
	await corner.click();
	await expect(corner).toHaveAttribute('aria-pressed', 'true');
	await expect(
		modal.getByRole('button', { name: 'Column 2', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(modal.getByRole('status')).toHaveText('12 cells selected');
	await clearBulkSelection(modal);
	await expect(modal.getByRole('status')).toHaveText('0 cells selected');
	await expect(
		modal.getByRole('button', { name: 'Apply to 9 cells', exact: true })
	).toBeEnabled();
	expect(await source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Apply to 9 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const after = await source(page);
	expect(after.attributes.columns).toEqual(before.attributes.columns);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 4; c++) {
			let size: string | undefined;
			if (c === 1) {
				size = '24px';
			} else if (r !== 1) {
				size = '18px';
			}
			expect(
				(
					after.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c].attributes.style as {
						typography: {
							fontSize?: string;
						};
					}
				).typography.fontSize
			).toBe(size);
			expect(
				after.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].innerBlocks
			).toEqual(
				before.innerBlocks.filter(
					(candidate) => candidate.attributes.row === r
				)[c].innerBlocks
			);
		}
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(after);
});
test('preview reflects inherited and local styles, keeps backgrounds visible while selected and discards all drafts on cancel', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			style: {
				typography: { fontSize: '18px', lineHeight: '1.5' },
				color: { text: '#123456' },
			},
			styleTokens: {
				cellPaddingBlock: '11px',
				borderWidth: '2px',
				borderColor: '#334455',
			},
		});
		actions.updateBlockAttributes(table.innerBlocks[0].clientId, {
			style: { typography: { fontSize: '120%', lineHeight: '1.8' } },
			styleTokens: {
				cellBackgroundColor: '#fff0cc',
				cellPaddingTop: '13px',
				borderTopStyle: 'dotted',
			},
		});
		actions.updateBlockAttributes(
			table.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].clientId,
			{
				styleTokens: {
					cellBackgroundColor: '#fff0cc',
					cellPaddingTop: '13px',
					borderTopStyle: 'dotted',
					cellPaddingInline: '7px',
					borderRightWidth: '4px',
					borderRightStyle: 'solid',
					borderRightColor: '#aa3344',
				},
			}
		);
	});
	const before = await source(page);
	const original = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	// Attribute dispatch completes before React paints the editor in WebKit.
	await expect(original).toHaveCSS('background-color', 'rgb(255, 240, 204)');
	await expect(original).toHaveCSS('padding-top', '13px');
	const properties = [
		'background-color',
		'color',
		'font-size',
		'line-height',
		'text-align',
		'padding-top',
		'padding-right',
		'border-top-width',
		'border-top-style',
		'border-top-color',
		'border-right-width',
		'border-right-color',
	];
	const current = await original.evaluate(
		(node, names) =>
			Object.fromEntries(
				names.map((name) => [
					name,
					getComputedStyle(node).getPropertyValue(name),
				])
			),
		properties
	);
	await open(page);
	const modal = dialog(page);
	const cell = modal.locator('td[aria-label="Cell at row 1, column 1"]');
	for (const property of properties) {
		await expect(cell).toHaveCSS(property, current[property]);
	}
	await expect(
		modal.locator('.modular-table-blocks-bulk-preview-selection')
	).toHaveCount(1);
	await expect(cell).toHaveCSS('background-color', 'rgb(255, 240, 204)');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await panel(page, 'Border');
	// Native BorderBoxControl starts split because the first cell has a different right width.
	const allWidth = modal.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	if ((await allWidth.count()) === 1 && (await allWidth.isVisible())) {
		await allWidth.fill('3');
	} else {
		await modal
			.getByRole('group', { name: 'Top border', exact: true })
			.getByRole('spinbutton')
			.first()
			.fill('3');
	}
	await panel(page, 'Padding');
	await resetBulkPanel(page, 'Padding');
	await expect(cell).toHaveCSS('padding-top', '11px');
	await modal.getByRole('button', { name: 'Column 3', exact: true }).click();
	await panel(page, 'Typography');
	await modal
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('30');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(cell).toHaveCSS('background-color', 'rgb(255, 240, 204)');
	await page.screenshot({
		path: test.info().outputPath('styled-preview-drafts.png'),
	});
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
	await open(page);
	await expect(
		dialog(page).getByRole('button', {
			name: 'Apply to 0 cells',
			exact: true,
		})
	).toBeDisabled();
	await dialog(page).press('Escape');
});

test('whole-table defaults clear only changed overrides and later row edits remain local through undo reload and new cells', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			style: {
				color: { background: '#ffff00' },
				spacing: { margin: { top: '15px' } },
			},
		});
		actions.updateBlockAttributes(table.innerBlocks[0].clientId, {
			fontSize: 'large',
			verticalAlign: 'bottom',
			styleTokens: {
				...(table.innerBlocks[0].attributes.styleTokens as object),
				cellBackgroundColor: '#ff0000',
			},
		});
	});
	const before = await source(page);
	await open(page);
	const modal = dialog(page);
	// Keep this inheritance test independent of the installed theme's palette.
	await page.evaluate(() => {
		const settings = window.wp.data
			.select('core/block-editor')
			.getSettings();
		const features = settings.__experimentalFeatures as Record<
			string,
			unknown
		>;
		window.wp.data.dispatch('core/block-editor').updateSettings({
			...settings,
			colors: [{ name: 'Contrast', slug: 'contrast', color: '#000000' }],
			__experimentalFeatures: {
				...features,
				color: {
					custom: true,
					defaultPalette: false,
					palette: {
						theme: [
							{
								name: 'Contrast',
								slug: 'contrast',
								color: '#000000',
							},
						],
					},
				},
			},
		});
	});
	await panel(page, 'Typography');
	const size = modal.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('12');
	await size.press('Tab');
	await expect(modal.locator('tbody td').last()).toHaveCSS(
		'font-size',
		'12px'
	);
	await panel(page, 'Cell background');
	await modal
		.getByRole('button', { name: 'Cell background', exact: true })
		.last()
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await page.keyboard.press('Escape');
	await panel(page, 'Alignment');
	await modal
		.locator('.modular-table-blocks-alignment-matrix')
		.getByRole('gridcell')
		.nth(4)
		.click();
	await expect(modal.locator('tbody td').last()).toHaveCSS(
		'vertical-align',
		'middle'
	);
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await panel(page, 'Typography');
	await size.fill('10');
	await size.press('Tab');
	await expect(modal.locator('tbody td').first()).toHaveCSS(
		'font-size',
		'10px'
	);
	await expect(modal.locator('tbody td').last()).toHaveCSS(
		'font-size',
		'12px'
	);
	expect(await source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Apply to 12 cells', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	const after = await source(page);
	expect(after.attributes.style).toMatchObject({
		color: { background: '#ffff00' },
		spacing: { margin: { top: '15px' } },
		typography: { fontSize: '12px', textAlign: 'center' },
	});
	expect(after.attributes.verticalAlign).toBe('middle');
	expect(after.attributes.styleTokens).toMatchObject({
		cellBackgroundColor: 'var(--wp--preset--color--contrast)',
	});
	expect(after.attributes).not.toHaveProperty('rowStyles');
	for (const cell of after.innerBlocks) {
		expect(cell.attributes.verticalAlign).toBeUndefined();
		expect(cell.attributes.fontSize).toBeUndefined();
		expect(
			(
				cell.attributes.style as {
					typography?: { fontSize?: string; textAlign?: string };
				}
			)?.typography?.fontSize
		).toBe(cell.attributes.row === 0 ? '10px' : undefined);
		expect(
			(cell.attributes.style as { typography?: { textAlign?: string } })
				?.typography?.textAlign
		).toBeUndefined();
		const tokens = cell.attributes.styleTokens as Record<string, string>;
		expect(tokens.cellBackgroundColor).toBeUndefined();
		expect(tokens.borderColor).toBe(
			(
				before.innerBlocks.find(
					(item) => item.clientId === cell.clientId
				)!.attributes.styleTokens as Record<string, string>
			).borderColor
		);
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(after);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const cells = (await editorCanvas(page)).locator(
		'.modular-table-blocks-editor__cell'
	);
	await expect(cells.first()).toHaveCSS('font-size', '10px');
	await expect(cells.last()).toHaveCSS('font-size', '12px');
	await expect(cells.last()).toHaveCSS('align-content', 'center');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	await page
		.getByRole('button', { name: 'Table structure', exact: true })
		.click();
	await page
		.getByRole('menuitem', { name: 'Add column at end', exact: true })
		.click();
	await expect(cells).toHaveCount(15);
	await expect(cells.nth(4)).toHaveCSS('font-size', '10px');
	await expect(cells.nth(4)).toHaveCSS('align-content', 'center');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.goto(`/?p=${id}`);
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	await expect(table).toHaveCSS('background-color', 'rgb(255, 255, 0)');
	await expect(table.locator('td').first()).toHaveCSS('font-size', '10px');
	await expect(table.locator('td').nth(4)).toHaveCSS('font-size', '10px');
	await expect(table.locator('td').nth(4)).toHaveCSS(
		'vertical-align',
		'middle'
	);
	await expect(table.locator('td').nth(4)).toHaveCSS('text-align', 'center');
});

test('apply normalizes uniform edited values and stays open for repeated editing while closing discards only new drafts', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			style: { typography: { fontSize: '14px' } },
		});
		for (const cell of table.innerBlocks) {
			actions.updateBlockAttributes(cell.clientId, {
				style: {
					...(cell.attributes.style as object),
					typography: {
						textAlign: 'right',
						fontSize: cell.attributes.row === 0 ? '10px' : '12px',
					},
				},
			});
		}
	});
	const before = await source(page);
	await open(page, false);
	const modal = dialog(page);
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await panel(page, 'Typography');
	const size = modal.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('12');
	await size.press('Tab');
	await modal
		.getByRole('button', { name: 'Apply to 4 cells', exact: true })
		.click();
	await expect(modal).toBeVisible();
	await expect(modal).toContainText('Changes applied.');
	await expect(modal.getByRole('status')).toHaveText('4 cells selected (1)');
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	const first = await source(page);
	expect(first.attributes.style).toMatchObject({
		typography: { fontSize: '12px' },
	});
	for (let i = 0; i < first.innerBlocks.length; i++) {
		expect(
			(
				first.innerBlocks[i].attributes.style as {
					typography: { fontSize?: string };
				}
			).typography.fontSize
		).toBeUndefined();
		expect(first.innerBlocks[i].attributes.styleTokens).toEqual(
			before.innerBlocks[i].attributes.styleTokens
		);
		expect(first.innerBlocks[i].innerBlocks).toEqual(
			before.innerBlocks[i].innerBlocks
		);
	}
	await expect(modal.locator('tbody td').first()).toHaveCSS(
		'font-size',
		'12px'
	);
	await expect(size).toHaveValue('12');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
	await size.fill('10');
	await size.press('Tab');
	await modal
		.getByRole('button', { name: 'Apply to 4 cells', exact: true })
		.click();
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	const second = await source(page);
	expect(second.attributes.style).toMatchObject({
		typography: { fontSize: '12px' },
	});
	await expect(
		modal.locator('tbody tr').nth(1).locator('td').first()
	).toHaveCSS('font-size', '10px');
	await expect(
		modal.locator('tbody tr').last().locator('td').first()
	).toHaveCSS('font-size', '12px');
	await page.screenshot({
		path: test.info().outputPath('bulk-applied-stays-open.png'),
	});
	await size.fill('8');
	await size.press('Tab');
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await expect(modal).toBeHidden();
	expect(await source(page)).toEqual(second);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(first);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(first);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(second);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const editorCells = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell');
	await expect(editorCells.first()).toHaveCSS('font-size', '12px');
	await expect(editorCells.nth(4)).toHaveCSS('font-size', '10px');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCells = page.locator(
		'table.wp-block-modular-table-blocks-table td'
	);
	await expect(publicCells.first()).toHaveCSS('font-size', '12px');
	await expect(publicCells.nth(4)).toHaveCSS('font-size', '10px');
});

test('apply prefers current parent inheritance in mixed cells and preserves differing overrides through undo and reload', async ({
	page,
}) => {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			style: { typography: { fontSize: '14px' } },
		});
		const sizes = ['8px', '12px', '10px'];
		for (const cell of table.innerBlocks) {
			actions.updateBlockAttributes(cell.clientId, {
				style: {
					...(cell.attributes.style as object),
					typography: {
						textAlign: 'right',
						fontSize: sizes[Number(cell.attributes.row)],
					},
				},
			});
		}
	});
	await open(page, false);
	const modal = dialog(page);
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	await panel(page, 'Typography');
	const size = modal.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('12');
	await size.press('Tab');
	// The parent changes while the modal holds an earlier source snapshot.
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				style: {
					typography: { fontSize: '12px', fontFamily: 'serif' },
				},
			});
	});
	const before = await source(page);
	await modal
		.getByRole('button', { name: 'Apply to 4 cells', exact: true })
		.click();
	await expect(modal).toBeVisible();
	await expect(
		modal.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	const after = await source(page);
	expect(after.attributes).toEqual(before.attributes);
	for (let index = 0; index < after.innerBlocks.length; index++) {
		const cell = after.innerBlocks[index];
		const typography = (
			cell.attributes.style as { typography: Record<string, unknown> }
		).typography;
		expect(typography.fontSize).toBe(index < 8 ? undefined : '10px');
		expect(typography.textAlign).toBe('right');
		expect(cell.attributes.styleTokens).toEqual(
			before.innerBlocks[index].attributes.styleTokens
		);
		expect(cell.innerBlocks).toEqual(before.innerBlocks[index].innerBlocks);
	}
	await expect(modal.locator('tbody td').first()).toHaveCSS(
		'font-size',
		'12px'
	);
	await expect(modal.locator('tbody td').nth(4)).toHaveCSS(
		'font-size',
		'12px'
	);
	await expect(modal.locator('tbody td').nth(8)).toHaveCSS(
		'font-size',
		'10px'
	);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(after);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const editorCells = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell');
	await expect(editorCells.first()).toHaveCSS('font-size', '12px');
	await expect(editorCells.nth(8)).toHaveCSS('font-size', '10px');
	expect(
		(await source(page)).innerBlocks.map(
			(cell) =>
				(
					cell.attributes.style as {
						typography: Record<string, unknown>;
					}
				).typography.fontSize
		)
	).toEqual([
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		'10px',
		'10px',
		'10px',
		'10px',
	]);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const cells = page.locator('table.wp-block-modular-table-blocks-table td');
	await expect(cells.first()).toHaveCSS('font-size', '12px');
	await expect(cells.nth(4)).toHaveCSS('font-size', '12px');
	await expect(cells.nth(8)).toHaveCSS('font-size', '10px');
	await expect(cells.first()).not.toHaveAttribute(
		'style',
		/(?:^|;)\s*font-size:/
	);
	await expect(cells.nth(4)).not.toHaveAttribute(
		'style',
		/(?:^|;)\s*font-size:/
	);
});
